import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import { authorizeSquadChannel } from '@api/modules/squad/realtime'
import { requireRoom, seatsOf } from '@api/modules/squad/store'
import type { SquadRealtimeAuth } from '@broke-oclock/contracts/squad'

const CHANNEL_PREFIX = 'private-squad-'

export const authorizeRoomChannel = async (
  database: Database,
  actor: AuthenticatedActor,
  input: SquadRealtimeAuth,
) => {
  const room = await requireRoom(database, input.channel.slice(CHANNEL_PREFIX.length))
  const seat = (await seatsOf(database, room.id)).find((each) => each.userId === actor.userId)
  if (!seat) throw new DomainError('FORBIDDEN', 'You are not in this room')
  if (seat.kickedAt) throw new DomainError('FORBIDDEN', 'The host removed you from this room')
  const signed = authorizeSquadChannel(input.socketId, input.channel)
  if (!signed) throw new DomainError('NOT_FOUND', 'Live rooms are not set up here')
  return signed
}
