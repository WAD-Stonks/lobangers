import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import { publishBallot, squadRealtimeEnabled } from '@api/modules/squad/realtime'
import { requireMember } from '@api/modules/squad/rooms'
import {
  isPresent,
  MAX_EFFECTS_PER_SEND,
  MAX_REPLAY_EVENTS,
  SEEN_WRITE_AFTER_MS,
} from '@api/modules/squad/rules'
import { needsSettling, settle } from '@api/modules/squad/settle'
import { buildState } from '@api/modules/squad/state'
import {
  appendEvents,
  emitEvents,
  type RoomRow,
  requireRoom,
  roomTransaction,
  type SeatRow,
  seatsOf,
} from '@api/modules/squad/store'
import {
  SQUAD_MAX_TAPS,
  type SquadChoiceInput,
  type SquadState,
  type SquadSyncResponse,
  type SquadVoteInput,
} from '@broke-oclock/contracts/squad'

// Voting in a live room. Yay and Nah can be tapped again and again: every tap counts and shows
// as an effect for everyone, and the latest one is the member's stance. Once a round is decided
// everyone picks "vote again" or "next deal". Sync is the heartbeat and the polling fallback.

const ballotKey = (roomId: string, memberId: string, dealIndex: number, round: number) => ({
  roomId_memberId_dealIndex_round: { roomId, memberId, dealIndex, round },
})

const requireVoter = <T extends { spectator: boolean }>(seat: T) => {
  if (seat.spectator)
    throw new DomainError(
      'FORBIDDEN',
      'You joined after the room started, so you can watch but not vote',
    )
  return seat
}

// Seats as the room should count them right now: whoever just acted is here.
const withSeen = (seats: readonly SeatRow[], seatId: string, now: Date) =>
  seats.map((seat) => (seat.id === seatId ? { ...seat, lastSeenAt: now } : seat))

// Marks a seat as still here outside any transaction, and only when the last mark is stale, so
// a member's heartbeat never clashes with their own votes. Returns the seats as now seen.
const markSeen = async (
  database: Database,
  seats: readonly SeatRow[],
  seatId: string,
  now: Date,
): Promise<SeatRow[]> => {
  const seat = seats.find((candidate) => candidate.id === seatId)
  if (!seat || !isPresent(seat)) return [...seats]
  if (now.getTime() - seat.lastSeenAt.getTime() >= SEEN_WRITE_AFTER_MS)
    await database.squadMember.update({ where: { id: seat.id }, data: { lastSeenAt: now } })
  return withSeen(seats, seatId, now)
}

// Adds a batch of taps to the member's ballot in one atomic upsert, with no transaction: spamming
// Yay and Nah sends overlapping requests from the same member, and transactions writing the same
// ballot abort each other. The tally is capped in the same update. Returns the new ballot.
const addTaps = async (
  database: Database,
  room: RoomRow,
  memberId: string,
  input: SquadVoteInput,
  now: Date,
) => {
  const counted = (field: 'yays' | 'nahs', add: number) =>
    add > 0
      ? { $min: [SQUAD_MAX_TAPS, { $add: [{ $ifNull: [`$${field}`, 0] }, add] }] }
      : { $ifNull: [`$${field}`, 0] }
  const yay = input.stance === 'YAY'
  const result = await database.$runCommandRaw({
    findAndModify: 'SquadVote',
    query: {
      roomId: { $oid: room.id },
      memberId: { $oid: memberId },
      dealIndex: room.dealIndex,
      round: room.round,
    },
    update: [
      {
        $set: {
          stance: { $literal: input.stance },
          yays: counted('yays', yay ? input.taps : 0),
          nahs: counted('nahs', yay ? 0 : input.taps),
          choice: { $ifNull: ['$choice', null] },
          updatedAt: { $date: now.toISOString() },
        },
      },
    ],
    upsert: true,
    new: true,
    fields: { yays: 1 },
  })
  const yays = (result.value as { yays?: unknown } | null)?.yays
  if (result.ok !== 1 || typeof yays !== 'number')
    throw new Error(`Squad tap write failed: ${JSON.stringify(result)}`)
  return { memberId, stance: input.stance, yays }
}

// Moves the room along when it is due, in a transaction only then. Returns the room and seats to
// build the reply from, counting the member who just acted as here.
const settleIfDue = async (
  database: Database,
  room: RoomRow,
  seats: readonly SeatRow[],
  seatId: string,
  now: Date,
) => {
  if (!(await needsSettling(database, room, seats, now))) return { room, seats: [...seats] }
  const settled = await roomTransaction(database, async (tx) => {
    const current = await requireRoom(tx, room.code)
    return settle(tx, current, withSeen(await seatsOf(tx, current.id), seatId, now), now)
  })
  return { room: settled, seats: withSeen(await seatsOf(database, settled.id), seatId, now) }
}

export const vote = async (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  input: SquadVoteInput,
  now: Date,
): Promise<SquadState> => {
  const room = await requireRoom(database, code)
  const before = await seatsOf(database, room.id)
  const seat = requireVoter(requireMember(before, actor.userId))
  if (room.status !== 'LIVE' || room.phase !== 'VOTING')
    throw new DomainError('PRECONDITION_FAILED', 'Voting on this deal has finished')
  const ballot = await addTaps(database, room, seat.id, input, now)
  // With a live channel the tap effects already went browser to browser, so only the new
  // ballot is pushed. Without one, the effects go in the event log for others to poll.
  if (squadRealtimeEnabled()) await publishBallot(room.code, ballot)
  else
    await emitEvents(
      database,
      room,
      Array.from({ length: Math.min(input.taps, MAX_EFFECTS_PER_SEND) }, () => ({
        kind: input.stance,
        memberId: seat.id,
        dealIndex: room.dealIndex,
      })),
    )
  const seen = await markSeen(database, before, seat.id, now)
  const settled = await settleIfDue(database, room, seen, seat.id, now)
  return buildState(database, settled.room, settled.seats, actor.userId, now)
}

export const choose = async (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  input: SquadChoiceInput,
  now: Date,
): Promise<SquadState> => {
  const { room, seatId } = await roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    const seats = await seatsOf(tx, room.id)
    const seat = requireVoter(requireMember(seats, actor.userId))
    // After a match the only choice is to keep looking.
    if (room.status !== 'LIVE' || (room.phase !== 'DECIDING' && room.phase !== 'MATCHED'))
      throw new DomainError('PRECONDITION_FAILED', 'The room has already moved on')
    if (room.phase === 'MATCHED' && input.choice !== 'NEXT')
      throw new DomainError('BAD_REQUEST', 'This deal already matched. Pick Keep looking instead')
    await tx.squadVote.upsert({
      where: ballotKey(room.id, seat.id, room.dealIndex, room.round),
      create: {
        roomId: room.id,
        memberId: seat.id,
        dealIndex: room.dealIndex,
        round: room.round,
        choice: input.choice,
      },
      update: { choice: input.choice },
    })
    await appendEvents(tx, room, [
      { kind: input.choice, memberId: seat.id, dealIndex: room.dealIndex },
    ])
    return { room: await settle(tx, room, withSeen(seats, seat.id, now), now), seatId: seat.id }
  })
  return stateAfter(database, room, seatId, actor.userId, now)
}

const stateAfter = async (
  database: Database,
  room: RoomRow,
  seatId: string,
  userId: string,
  now: Date,
) => {
  const seats = await markSeen(database, await seatsOf(database, room.id), seatId, now)
  return buildState(database, room, seats, userId, now)
}

// The heartbeat: marks the member as still here, moves the room along if it is due, and returns
// the state plus every effect since `after`. Most beats only read; a transaction runs only when
// the room actually has to change. Someone who left can still sync, so they see "still voting"
// and can rejoin.
export const sync = async (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  after: number,
  now: Date,
): Promise<SquadSyncResponse> => {
  const found = await requireRoom(database, code)
  const before = await seatsOf(database, found.id)
  const seat = before.find((candidate) => candidate.userId === actor.userId)
  if (!seat) throw new DomainError('FORBIDDEN', 'You are not in this room')
  const seen = await markSeen(database, before, seat.id, now)
  const { room, seats } = await settleIfDue(database, found, seen, seat.id, now)
  const fresh = await database.squadEvent.findMany({
    where: { roomId: room.id, seq: { gt: after } },
    orderBy: { seq: 'desc' },
    take: MAX_REPLAY_EVENTS,
  })
  return {
    state: await buildState(database, room, seats, actor.userId, now),
    events: [...fresh].reverse().map((event) => ({
      seq: event.seq,
      kind: event.kind as SquadSyncResponse['events'][number]['kind'],
      memberId: event.memberId ?? null,
      dealIndex: event.dealIndex ?? null,
      at: event.createdAt.toISOString(),
    })),
    // The newest event actually stored, so a number still being written is never skipped.
    nextSeq: fresh[0]?.seq ?? after,
  }
}

// What the join screen needs before someone joins: is the room open, has it started, is it full.
export const peekRoom = async (database: Database, code: string, now: Date) => {
  const room = await requireRoom(database, code)
  const seats = await seatsOf(database, room.id)
  const present = seats.filter(isPresent)
  const host = present.find((seat) => seat.isHost)
  return {
    code: room.code,
    status: room.status,
    capacity: room.capacity,
    members: present.filter((seat) => !seat.spectator).length,
    hostName: host?.displayName ?? null,
    names: present.map((seat) => seat.displayName),
    createdAt: room.createdAt.toISOString(),
    serverTime: now.toISOString(),
  }
}
