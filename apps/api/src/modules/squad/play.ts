import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
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

// The transaction only records the ballot and moves the room along; the full room view is read
// after it commits, which keeps the window for clashing taps short.
export const vote = async (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  input: SquadVoteInput,
  now: Date,
): Promise<SquadState> => {
  const { room, seatId } = await roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    const seats = await seatsOf(tx, room.id)
    const seat = requireVoter(requireMember(seats, actor.userId))
    if (room.status !== 'LIVE' || room.phase !== 'VOTING')
      throw new DomainError('PRECONDITION_FAILED', 'Voting on this deal has finished')
    const yay = input.stance === 'YAY'
    const key = ballotKey(room.id, seat.id, room.dealIndex, room.round)
    const current = await tx.squadVote.findUnique({
      where: key,
      select: { yays: true, nahs: true },
    })
    const count = (field: number | undefined) => Math.min(SQUAD_MAX_TAPS, (field ?? 0) + input.taps)
    await tx.squadVote.upsert({
      where: key,
      create: {
        roomId: room.id,
        memberId: seat.id,
        dealIndex: room.dealIndex,
        round: room.round,
        stance: input.stance,
        yays: yay ? count(0) : 0,
        nahs: yay ? 0 : count(0),
      },
      update: {
        stance: input.stance,
        ...(yay ? { yays: count(current?.yays) } : { nahs: count(current?.nahs) }),
      },
    })
    const effects = Math.min(input.taps, MAX_EFFECTS_PER_SEND)
    await appendEvents(
      tx,
      room,
      Array.from({ length: effects }, () => ({
        kind: input.stance,
        memberId: seat.id,
        dealIndex: room.dealIndex,
      })),
    )
    return { room: await settle(tx, room, withSeen(seats, seat.id, now), now), seatId: seat.id }
  })
  return stateAfter(database, room, seatId, actor.userId, now)
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
    if (room.status !== 'LIVE' || room.phase !== 'DECIDING')
      throw new DomainError('PRECONDITION_FAILED', 'The room has already moved on')
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
  const room = (await needsSettling(database, found, seen, now))
    ? await roomTransaction(database, async (tx) => {
        const current = await requireRoom(tx, code)
        return settle(tx, current, withSeen(await seatsOf(tx, current.id), seat.id, now), now)
      })
    : found
  const [fresh, seats] = await Promise.all([
    database.squadEvent.findMany({
      where: { roomId: room.id, seq: { gt: after } },
      orderBy: { seq: 'desc' },
      take: MAX_REPLAY_EVENTS,
    }),
    room === found ? Promise.resolve(seen) : seatsOf(database, room.id),
  ])
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
