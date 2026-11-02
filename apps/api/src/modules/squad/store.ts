import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import type { SquadEventKind } from '@broke-oclock/contracts/squad'

// Room storage shared by every Makan Squad write: a retrying transaction (members tap at the
// same time, and MongoDB aborts one of two clashing transactions), room lookup by code, and the
// event log the other members replay.

export type Tx = Parameters<Parameters<Database['$transaction']>[0]>[0]

const ATTEMPTS = 5
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
    try {
      return await database.$transaction(work)
    } catch (error) {
      if (!isRetryable(error) || attempt >= ATTEMPTS) {
        if (isRetryable(error)) throw new DomainError('CONFLICT', 'The room is busy. Try again.')
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.random() * 25))
    }
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

// Appends events in order; the room's counter hands out their sequence numbers.
export const appendEvents = async (tx: Tx, roomId: string, events: readonly NewEvent[]) => {
  if (events.length === 0) return
  const room = await tx.squadRoom.update({
    where: { id: roomId },
    data: { eventSeq: { increment: events.length }, version: { increment: 1 } },
    select: { eventSeq: true },
  })
  const first = room.eventSeq - events.length + 1
  await tx.squadEvent.createMany({
    data: events.map((event, index) => ({
      roomId,
      seq: first + index,
      kind: event.kind,
      memberId: event.memberId ?? null,
      dealIndex: event.dealIndex ?? null,
    })),
  })
}
