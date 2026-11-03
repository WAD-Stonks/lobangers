import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import { publishEvents, type WrittenEvent } from '@api/modules/squad/realtime'
import type { SquadEventKind } from '@broke-oclock/contracts/squad'

// Room storage shared by every Makan Squad write: a retrying transaction (members tap at the
// same time, and MongoDB aborts one of two clashing transactions), room lookup by code, and the
// event log the other members replay. A transaction only queues its events: once it commits
// they get their sequence numbers from an atomic counter outside any transaction, are stored,
// and are pushed live. Keeping the counter out of the transaction matters: every tap used to
// bump the same room document inside it, so members tapping together aborted each other.

export type Tx = Parameters<Parameters<Database['$transaction']>[0]>[0]

const ATTEMPTS = 5
// Room transactions are short, but a cold serverless start can make the first one slow.
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const
type Queued = { roomId: string; code: string; event: NewEvent }
// Events each open transaction has queued, recorded after it commits.
const outbox = new WeakMap<Tx, Queued[]>()
const isRetryable = (error: unknown) =>
  typeof error === 'object' &&
  !!error &&
  'code' in error &&
  ['P2034', 'P2028'].includes(String(error.code))

export const roomTransaction = async <T>(
  database: Database,
  work: (tx: Tx) => Promise<T>,
): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    let queued: Queued[] = []
    let result: T
    try {
      result = await database.$transaction(async (tx) => {
        queued = []
        outbox.set(tx, queued)
        return work(tx)
      }, TRANSACTION_OPTIONS)
    } catch (error) {
      if (!isRetryable(error) || attempt >= ATTEMPTS) {
        if (isRetryable(error)) throw new DomainError('CONFLICT', 'The room is busy. Try again.')
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.random() * 25))
      continue
    }
    await emitQueued(database, queued)
    return result
  }
}

export const roomSelect = {
  id: true,
  code: true,
  status: true,
  phase: true,
  capacity: true,
  dealIds: true,
  dealIndex: true,
  round: true,
  matchDealId: true,
  closeReason: true,
  eventSeq: true,
  createdAt: true,
} as const

export const seatSelect = {
  id: true,
  userId: true,
  displayName: true,
  avatar: true,
  isHost: true,
  spectator: true,
  joinedAt: true,
  lastSeenAt: true,
  leftAt: true,
  kickedAt: true,
} as const

export type RoomRow = NonNullable<Awaited<ReturnType<typeof findRoom>>>
export type SeatRow = Awaited<ReturnType<typeof seatsOf>>[number]

// The open room with this code, or the most recent closed one so its members see why it ended.
export const findRoom = async (tx: Tx | Database, code: string) =>
  (await tx.squadRoom.findUnique({ where: { openCode: code }, select: roomSelect })) ??
  (await tx.squadRoom.findFirst({
    where: { code },
    orderBy: { createdAt: 'desc' },
    select: roomSelect,
  }))

export const requireRoom = async (tx: Tx | Database, code: string) => {
  const room = await findRoom(tx, code)
  if (!room)
    throw new DomainError(
      'NOT_FOUND',
      'No room with that code. Check the letters with your friend.',
    )
  return room
}

export const seatsOf = (tx: Tx | Database, roomId: string) =>
  tx.squadMember.findMany({ where: { roomId }, orderBy: { joinedAt: 'asc' }, select: seatSelect })

export const requireOpen = (room: RoomRow) => {
  if (room.status === 'CLOSED') throw new DomainError('PRECONDITION_FAILED', 'This room has closed')
}

export type NewEvent = { kind: SquadEventKind; memberId?: string | null; dealIndex?: number | null }

// Records and pushes events for a write that has already committed. A failure from here on must
// not turn that write into an error reply, so it is logged instead.
const emitQueued = async (database: Database, queued: readonly Queued[]) => {
  const written = await recordEvents(database, queued).catch((error: unknown) => {
    console.error('Squad event log write failed', {
      events: queued.length,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  })
  await publishEvents(written)
}

// For writes made outside a transaction, such as taps.
export const emitEvents = (
  database: Database,
  room: { id: string; code: string },
  events: readonly NewEvent[],
) =>
  emitQueued(
    database,
    events.map((event) => ({ roomId: room.id, code: room.code, event })),
  )

// Queues events, in order, to be recorded once the transaction commits.
export const appendEvents = async (
  tx: Tx,
  room: { id: string; code: string },
  events: readonly NewEvent[],
) => {
  outbox.get(tx)?.push(...events.map((event) => ({ roomId: room.id, code: room.code, event })))
}

// Numbers and stores committed events. The increment is a single atomic update, so concurrent
// writers queue on it instead of failing. Events are effects; the room state is the source of
// truth, so a write that dies here costs a few animations, never a vote.
const recordEvents = async (
  database: Database,
  queued: readonly Queued[],
): Promise<WrittenEvent[]> => {
  const roomIds = [...new Set(queued.map((entry) => entry.roomId))]
  const written = await Promise.all(
    roomIds.map(async (roomId) => {
      const entries = queued.filter((entry) => entry.roomId === roomId)
      const counted = await database.squadRoom.update({
        where: { id: roomId },
        data: { eventSeq: { increment: entries.length }, version: { increment: 1 } },
        select: { eventSeq: true },
      })
      const first = counted.eventSeq - entries.length + 1
      const createdAt = new Date()
      const rows = entries.map((entry, index) => ({
        roomId,
        seq: first + index,
        kind: entry.event.kind,
        memberId: entry.event.memberId ?? null,
        dealIndex: entry.event.dealIndex ?? null,
        createdAt,
      }))
      await database.squadEvent.createMany({ data: rows })
      return rows.map((row, index) => ({
        code: entries[index]?.code ?? '',
        event: {
          seq: row.seq,
          kind: row.kind,
          memberId: row.memberId,
          dealIndex: row.dealIndex,
          at: createdAt.toISOString(),
        },
      }))
    }),
  )
  return written.flat()
}
