import type { Database } from '@api/modules/platform-admin/transaction'
import {
  choiceOutcome,
  isPresent,
  keepLookingOutcome,
  LOBBY_LIFETIME_MS,
  voters,
  votingOutcome,
} from '@api/modules/squad/rules'
import { loadDeals } from '@api/modules/squad/state'
import {
  appendEvents,
  type NewEvent,
  type RoomRow,
  roomSelect,
  type SeatRow,
  type Tx,
} from '@api/modules/squad/store'

// Moves a room along after any write or heartbeat: closes a lobby nobody started, skips a deal
// that ended mid-vote, and decides a round once everyone still around has had their say. Runs
// a few times so a skip can be followed by the next decision in one go. The decision is read
// first and written separately, so the heartbeat can check it without a transaction.

const MAX_STEPS = 4

export const closeRoom = async (
  tx: Tx,
  room: RoomRow,
  reason: 'HOST_CLOSED' | 'EXPIRED' | 'EMPTY',
  now: Date,
) => {
  await tx.squadRoom.update({
    where: { id: room.id },
    data: { status: 'CLOSED', closeReason: reason, closedAt: now, openCode: `closed:${room.id}` },
  })
  await appendEvents(tx, room, [{ kind: 'CLOSED' }])
}

// The next deal, or the end of the list.
const advance = (room: RoomRow, events: NewEvent[]) => {
  if (room.dealIndex + 1 < room.dealIds.length) {
    events.push({ kind: 'NEXT_DEAL', dealIndex: room.dealIndex + 1 })
    return { dealIndex: room.dealIndex + 1, round: 0, phase: 'VOTING' as const, matchDealId: null }
  }
  events.push({ kind: 'OUT_OF_DEALS', dealIndex: room.dealIndex })
  return { phase: 'OUT_OF_DEALS' as const, matchDealId: null }
}

type Reader = Tx | Database
type Step = { close: 'EXPIRED' | 'EMPTY' } | { data: Record<string, unknown>; events: NewEvent[] }

// What the room should do next, read without writing, or null when it should stay put.
const plan = async (
  reader: Reader,
  room: RoomRow,
  seats: readonly SeatRow[],
  now: Date,
): Promise<Step | null> => {
  if (room.status === 'LOBBY' && now.getTime() - room.createdAt.getTime() > LOBBY_LIFETIME_MS)
    return { close: 'EXPIRED' }
  if (room.status !== 'LIVE' || !['VOTING', 'DECIDING', 'MATCHED'].includes(room.phase)) return null
  if (!seats.some((seat) => isPresent(seat) && !seat.spectator)) return { close: 'EMPTY' }
  const events: NewEvent[] = []
  // A match stands even if its deal ends afterwards; the squad already picked it.
  const [deal] =
    room.phase === 'MATCHED'
      ? [{ ended: false }]
      : await loadDeals(reader, [room.dealIds[room.dealIndex] ?? ''], now)
  if (!deal || deal.ended) {
    events.push({ kind: 'DEAL_ENDED', dealIndex: room.dealIndex })
    return { data: advance(room, events), events }
  }
  const ballots = await reader.squadVote.findMany({
    where: { roomId: room.id, dealIndex: room.dealIndex, round: room.round },
    select: { memberId: true, stance: true, choice: true },
  })
  const voterIds = voters(seats, now).map((seat) => seat.id)
  if (room.phase === 'MATCHED')
    return keepLookingOutcome(voterIds, ballots) ? { data: advance(room, events), events } : null
  if (room.phase === 'VOTING') {
    const outcome = votingOutcome(voterIds, ballots)
    if (outcome === 'MATCH') {
      events.push({ kind: 'MATCH', dealIndex: room.dealIndex })
      return { data: { phase: 'MATCHED', matchDealId: room.dealIds[room.dealIndex] }, events }
    }
    return outcome === 'DECIDE' ? { data: { phase: 'DECIDING' }, events } : null
  }
  const outcome = choiceOutcome(voterIds, ballots)
  if (outcome === 'AGAIN') {
    events.push({ kind: 'REVOTE', dealIndex: room.dealIndex })
    return { data: { round: room.round + 1, phase: 'VOTING' }, events }
  }
  return outcome === 'NEXT' ? { data: advance(room, events), events } : null
}

const step = async (tx: Tx, room: RoomRow, seats: readonly SeatRow[], now: Date) => {
  const next = await plan(tx, room, seats, now)
  if (!next) return false
  if ('close' in next) {
    await closeRoom(tx, room, next.close, now)
    return false
  }
  await tx.squadRoom.update({ where: { id: room.id }, data: next.data })
  await appendEvents(tx, room, next.events)
  return true
}

// Whether a heartbeat has anything to move along; lets sync skip the transaction most times.
export const needsSettling = async (
  reader: Reader,
  room: RoomRow,
  seats: readonly SeatRow[],
  now: Date,
) => (await plan(reader, room, seats, now)) !== null

export const settle = async (
  tx: Tx,
  room: RoomRow,
  seats: readonly SeatRow[],
  now: Date,
): Promise<RoomRow> => {
  let current = room
  for (let index = 0; index < MAX_STEPS; index += 1) {
    if (!(await step(tx, current, seats, now))) break
    current = await tx.squadRoom.findUniqueOrThrow({ where: { id: room.id }, select: roomSelect })
  }
  return tx.squadRoom.findUniqueOrThrow({ where: { id: room.id }, select: roomSelect })
}
