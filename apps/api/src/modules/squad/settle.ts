import {
  choiceOutcome,
  isPresent,
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
// a few times so a skip can be followed by the next decision in one go.

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
  await appendEvents(tx, room.id, [{ kind: 'CLOSED' }])
}

// The next deal, or the end of the list.
const advance = (room: RoomRow, events: NewEvent[]) => {
  if (room.dealIndex + 1 < room.dealIds.length) {
    events.push({ kind: 'NEXT_DEAL', dealIndex: room.dealIndex + 1 })
    return { dealIndex: room.dealIndex + 1, round: 0, phase: 'VOTING' as const }
  }
  events.push({ kind: 'OUT_OF_DEALS', dealIndex: room.dealIndex })
  return { phase: 'OUT_OF_DEALS' as const }
}

const step = async (tx: Tx, room: RoomRow, seats: readonly SeatRow[], now: Date) => {
  if (room.status === 'LOBBY' && now.getTime() - room.createdAt.getTime() > LOBBY_LIFETIME_MS) {
    await closeRoom(tx, room, 'EXPIRED', now)
    return false
  }
  if (room.status !== 'LIVE' || (room.phase !== 'VOTING' && room.phase !== 'DECIDING')) return false
  if (!seats.some((seat) => isPresent(seat) && !seat.spectator)) {
    await closeRoom(tx, room, 'EMPTY', now)
    return false
  }
  const events: NewEvent[] = []
  const [deal] = await loadDeals(tx, [room.dealIds[room.dealIndex] ?? ''], now)
  let data: Record<string, unknown> | null = null
  if (!deal || deal.ended) {
    events.push({ kind: 'DEAL_ENDED', dealIndex: room.dealIndex })
    data = advance(room, events)
  } else {
    const ballots = await tx.squadVote.findMany({
      where: { roomId: room.id, dealIndex: room.dealIndex, round: room.round },
      select: { memberId: true, stance: true, choice: true },
    })
    const voterIds = voters(seats, now).map((seat) => seat.id)
    if (room.phase === 'VOTING') {
      const outcome = votingOutcome(voterIds, ballots)
      if (outcome === 'MATCH') {
        events.push({ kind: 'MATCH', dealIndex: room.dealIndex })
        data = { phase: 'MATCHED', matchDealId: room.dealIds[room.dealIndex] }
      } else if (outcome === 'DECIDE') data = { phase: 'DECIDING' }
    } else {
      const outcome = choiceOutcome(voterIds, ballots)
      if (outcome === 'AGAIN') {
        events.push({ kind: 'REVOTE', dealIndex: room.dealIndex })
        data = { round: room.round + 1, phase: 'VOTING' }
      } else if (outcome === 'NEXT') data = advance(room, events)
    }
  }
  if (!data) return false
  await tx.squadRoom.update({ where: { id: room.id }, data })
  await appendEvents(tx, room.id, events)
  return true
}

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
