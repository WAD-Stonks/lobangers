import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import { requireMember } from '@api/modules/squad/rooms'
import { isPresent, MAX_EFFECTS_PER_SEND, MAX_REPLAY_EVENTS } from '@api/modules/squad/rules'
import { settle } from '@api/modules/squad/settle'
import { buildState } from '@api/modules/squad/state'
import { appendEvents, requireRoom, roomTransaction, seatsOf } from '@api/modules/squad/store'
import {
  SQUAD_MAX_TAPS,
  type SquadChoiceInput,
  type SquadSyncResponse,
  type SquadVoteInput,
} from '@broke-oclock/contracts/squad'

// Voting in a live room. Yay and Nah can be tapped again and again: every tap counts and shows
// as an effect for everyone, and the latest one is the member's stance. Once a round is decided
// everyone picks "vote again" or "next deal". Sync is the heartbeat every member polls.

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

export const vote = (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  input: SquadVoteInput,
  now: Date,
) =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    const seats = await seatsOf(tx, room.id)
    const seat = requireVoter(requireMember(seats, actor.userId))
    if (room.status !== 'LIVE' || room.phase !== 'VOTING')
      throw new DomainError('PRECONDITION_FAILED', 'Voting on this deal has finished')
    const yay = input.stance === 'YAY'
    const current = await tx.squadVote.findUnique({
      where: ballotKey(room.id, seat.id, room.dealIndex, room.round),
    })
    const count = (field: number | undefined) => Math.min(SQUAD_MAX_TAPS, (field ?? 0) + input.taps)
    await tx.squadVote.upsert({
      where: ballotKey(room.id, seat.id, room.dealIndex, room.round),
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
      room.id,
      Array.from({ length: effects }, () => ({
        kind: input.stance,
        memberId: seat.id,
        dealIndex: room.dealIndex,
      })),
    )
    await tx.squadMember.update({ where: { id: seat.id }, data: { lastSeenAt: now } })
    const settled = await settle(tx, room, await seatsOf(tx, room.id), now)
    return buildState(tx, settled, await seatsOf(tx, room.id), actor.userId, now)
  })

export const choose = (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  input: SquadChoiceInput,
  now: Date,
) =>
  roomTransaction(database, async (tx) => {
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
    await appendEvents(tx, room.id, [
      { kind: input.choice, memberId: seat.id, dealIndex: room.dealIndex },
    ])
    await tx.squadMember.update({ where: { id: seat.id }, data: { lastSeenAt: now } })
    const settled = await settle(tx, room, await seatsOf(tx, room.id), now)
    return buildState(tx, settled, await seatsOf(tx, room.id), actor.userId, now)
  })

// Marks the member as still here, moves the room along, and returns the state plus every effect
// since `after`. Someone who left can still sync, so they see "still voting" and can rejoin.
export const sync = (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  after: number,
  now: Date,
): Promise<SquadSyncResponse> =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    const seats = await seatsOf(tx, room.id)
    const seat = seats.find((candidate) => candidate.userId === actor.userId)
    if (!seat) throw new DomainError('FORBIDDEN', 'You are not in this room')
    if (isPresent(seat))
      await tx.squadMember.update({ where: { id: seat.id }, data: { lastSeenAt: now } })
    const settled = await settle(tx, room, await seatsOf(tx, room.id), now)
    const fresh = await tx.squadEvent.findMany({
      where: { roomId: room.id, seq: { gt: after } },
      orderBy: { seq: 'desc' },
      take: MAX_REPLAY_EVENTS,
    })
    return {
      state: await buildState(tx, settled, await seatsOf(tx, room.id), actor.userId, now),
      events: fresh.reverse().map((event) => ({
        seq: event.seq,
        kind: event.kind as SquadSyncResponse['events'][number]['kind'],
        memberId: event.memberId ?? null,
        dealIndex: event.dealIndex ?? null,
        at: event.createdAt.toISOString(),
      })),
      nextSeq: settled.eventSeq,
    }
  })

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
