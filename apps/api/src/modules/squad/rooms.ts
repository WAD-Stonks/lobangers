import { randomInt } from 'node:crypto'
import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import { isPresent, nextHost, roomCode, sameName } from '@api/modules/squad/rules'
import { closeRoom, settle } from '@api/modules/squad/settle'
import { buildState, loadDeals } from '@api/modules/squad/state'
import {
  appendEvents,
  type NewEvent,
  requireOpen,
  requireRoom,
  roomTransaction,
  type SeatRow,
  seatsOf,
  type Tx,
} from '@api/modules/squad/store'
import type { SquadCreate, SquadJoin, SquadState } from '@broke-oclock/contracts/squad'

// Opening, joining and running a Makan Squad lobby. Anyone signed in can host or join; only
// the host starts, removes people, adds deals or closes the room. People who join after the
// room has started watch everything live but cannot vote.

const CODE_ATTEMPTS = 30
const MAX_ROOM_DEALS = 20

const isDuplicate = (error: unknown) =>
  typeof error === 'object' && !!error && 'code' in error && String(error.code) === 'P2002'

// Deals a room may vote on: approved, published, not deleted and still running.
const requireVotableDeals = async (
  database: Database | Tx,
  dealIds: readonly string[],
  now: Date,
) => {
  const deals = await loadDeals(database, dealIds, now)
  const published = await database.deal.count({
    where: { id: { in: [...dealIds] }, reviewStatus: 'APPROVED', publishedAt: { not: null } },
  })
  if (
    deals.length !== new Set(dealIds).size ||
    published !== new Set(dealIds).size ||
    deals.some((deal) => deal.ended)
  )
    throw new DomainError('BAD_REQUEST', 'One of those deals has ended. Pick another.')
}

const mySeat = (seats: readonly SeatRow[], userId: string) =>
  seats.find((seat) => seat.userId === userId)

export const requireMember = (seats: readonly SeatRow[], userId: string) => {
  const seat = mySeat(seats, userId)
  if (seat?.kickedAt) throw new DomainError('FORBIDDEN', 'The host removed you from this room')
  if (!seat || !isPresent(seat)) throw new DomainError('FORBIDDEN', 'You are not in this room')
  return seat
}

export const requireHost = (seats: readonly SeatRow[], userId: string) => {
  const seat = requireMember(seats, userId)
  if (!seat.isHost) throw new DomainError('FORBIDDEN', 'Only the host can do that')
  return seat
}

const stateFor = async (tx: Tx, code: string, userId: string, now: Date): Promise<SquadState> => {
  const room = await requireRoom(tx, code)
  return buildState(tx, room, await seatsOf(tx, room.id), userId, now)
}

export const createRoom = async (
  database: Database,
  actor: AuthenticatedActor,
  input: SquadCreate,
  now: Date,
): Promise<SquadState> => {
  await requireVotableDeals(database, input.dealIds, now)
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = roomCode(attempt, (max) => randomInt(max))
    try {
      return await roomTransaction(database, async (tx) => {
        const room = await tx.squadRoom.create({
          data: {
            code,
            openCode: code,
            capacity: input.capacity,
            dealIds: [...new Set(input.dealIds)],
            createdById: actor.userId,
          },
        })
        await tx.squadMember.create({
          data: {
            roomId: room.id,
            userId: actor.userId,
            displayName: input.displayName,
            avatar: input.avatar,
            isHost: true,
            lastSeenAt: now,
          },
        })
        return stateFor(tx, code, actor.userId, now)
      })
    } catch (error) {
      if (!isDuplicate(error)) throw error
    }
  }
  throw new DomainError('CONFLICT', 'Could not find a free room code. Try again.')
}

export const joinRoom = (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  input: SquadJoin,
  now: Date,
): Promise<SquadState> =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    requireOpen(room)
    const seats = await seatsOf(tx, room.id)
    const existing = mySeat(seats, actor.userId)
    if (existing?.kickedAt)
      throw new DomainError('FORBIDDEN', 'The host removed you from this room')
    if (existing && isPresent(existing)) return buildState(tx, room, seats, actor.userId, now)
    const others = seats.filter((seat) => isPresent(seat) && seat.userId !== actor.userId)
    const taken = others.find((seat) => sameName(seat.displayName, input.displayName))
    if (taken)
      throw new DomainError(
        'CONFLICT',
        `Someone here is already called ${taken.displayName}. Add an initial?`,
      )
    // A late joiner watches; someone who stepped out of a live room gets their vote back.
    const spectator = room.status === 'LIVE' && !(existing && !existing.spectator)
    if (!spectator && others.filter((seat) => !seat.spectator).length >= room.capacity)
      throw new DomainError(
        'CONFLICT',
        `Room ${room.code} is full (${room.capacity} of ${room.capacity})`,
      )
    const data = {
      displayName: input.displayName,
      avatar: input.avatar,
      spectator,
      leftAt: null,
      lastSeenAt: now,
    }
    const seat = existing
      ? await tx.squadMember.update({ where: { id: existing.id }, data })
      : await tx.squadMember.create({ data: { ...data, roomId: room.id, userId: actor.userId } })
    await appendEvents(tx, room.id, [{ kind: 'JOINED', memberId: seat.id }])
    return stateFor(tx, code, actor.userId, now)
  })

export const startRoom = (database: Database, actor: AuthenticatedActor, code: string, now: Date) =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    requireOpen(room)
    const seats = await seatsOf(tx, room.id)
    requireHost(seats, actor.userId)
    if (room.status !== 'LOBBY') return buildState(tx, room, seats, actor.userId, now)
    if (seats.filter((seat) => isPresent(seat) && !seat.spectator).length < 2)
      throw new DomainError('PRECONDITION_FAILED', 'Wait for at least one friend to join')
    await tx.squadRoom.update({
      where: { id: room.id },
      data: { status: 'LIVE', phase: 'VOTING', startedAt: now, dealIndex: 0, round: 0 },
    })
    await appendEvents(tx, room.id, [{ kind: 'STARTED', dealIndex: 0 }])
    return stateFor(tx, code, actor.userId, now)
  })

// Leaving hands the host role on; a lobby nobody is left in closes.
export const leaveRoom = (database: Database, actor: AuthenticatedActor, code: string, now: Date) =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    const seats = await seatsOf(tx, room.id)
    const seat = mySeat(seats, actor.userId)
    if (!seat || !isPresent(seat) || room.status === 'CLOSED')
      return buildState(tx, room, seats, actor.userId, now)
    await tx.squadMember.update({ where: { id: seat.id }, data: { leftAt: now, isHost: false } })
    const events: NewEvent[] = [{ kind: 'LEFT', memberId: seat.id }]
    const remaining = seats.filter((other) => other.id !== seat.id)
    const heir = seat.isHost ? nextHost(remaining) : null
    if (heir) {
      await tx.squadMember.update({ where: { id: heir.id }, data: { isHost: true } })
      events.push({ kind: 'HOST_CHANGED', memberId: heir.id })
    }
    await appendEvents(tx, room.id, events)
    const after = await seatsOf(tx, room.id)
    if (!after.some((other) => isPresent(other) && !other.spectator))
      await closeRoom(tx, room, 'EMPTY', now)
    else await settle(tx, room, after, now)
    return stateFor(tx, code, actor.userId, now)
  })

export const kickMember = (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  memberId: string,
  now: Date,
) =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    requireOpen(room)
    const seats = await seatsOf(tx, room.id)
    const host = requireHost(seats, actor.userId)
    const target = seats.find((seat) => seat.id === memberId)
    if (!target || !isPresent(target))
      throw new DomainError('NOT_FOUND', 'That person already left')
    if (target.id === host.id) throw new DomainError('BAD_REQUEST', 'Leave the room instead')
    await tx.squadMember.update({ where: { id: target.id }, data: { kickedAt: now } })
    await appendEvents(tx, room.id, [{ kind: 'KICKED', memberId: target.id }])
    await settle(tx, room, await seatsOf(tx, room.id), now)
    return stateFor(tx, code, actor.userId, now)
  })

export const closeRoomAsHost = (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  now: Date,
) =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    const seats = await seatsOf(tx, room.id)
    if (room.status === 'CLOSED') return buildState(tx, room, seats, actor.userId, now)
    requireHost(seats, actor.userId)
    await closeRoom(tx, room, 'HOST_CLOSED', now)
    return stateFor(tx, code, actor.userId, now)
  })

// After every deal was voted down, the host can add more and voting carries on.
export const addDeals = (
  database: Database,
  actor: AuthenticatedActor,
  code: string,
  dealIds: readonly string[],
  now: Date,
) =>
  roomTransaction(database, async (tx) => {
    const room = await requireRoom(tx, code)
    requireOpen(room)
    const seats = await seatsOf(tx, room.id)
    requireHost(seats, actor.userId)
    const fresh = [...new Set(dealIds)].filter((id) => !room.dealIds.includes(id))
    if (fresh.length === 0)
      throw new DomainError('BAD_REQUEST', 'Those deals are already in the room')
    if (room.dealIds.length + fresh.length > MAX_ROOM_DEALS)
      throw new DomainError('BAD_REQUEST', `A room can vote on up to ${MAX_ROOM_DEALS} deals`)
    await requireVotableDeals(tx, fresh, now)
    const outOfDeals = room.status === 'LIVE' && room.phase === 'OUT_OF_DEALS'
    await tx.squadRoom.update({
      where: { id: room.id },
      data: {
        dealIds: [...room.dealIds, ...fresh],
        ...(outOfDeals ? { dealIndex: room.dealIds.length, round: 0, phase: 'VOTING' } : {}),
      },
    })
    await appendEvents(tx, room.id, [{ kind: 'DEALS_ADDED', dealIndex: room.dealIds.length }])
    return stateFor(tx, code, actor.userId, now)
  })
