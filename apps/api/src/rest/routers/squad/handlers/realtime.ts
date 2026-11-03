import { authorizeRoomChannel } from '@api/modules/squad/channel'
import {
  authenticatedActor,
  createPublicRestHandler,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  squadEmptyQuerySchema,
  squadRealtimeAuthResponseSchema,
  squadRealtimeAuthSchema,
  squadRealtimeConfigSchema,
} from '@broke-oclock/contracts/squad'

// The public Pusher key the browser connects with; null tells it to poll instead.
export const realtimeConfigHandler = (dependencies: RestDependencies) =>
  createPublicRestHandler(dependencies, async (request, response) => {
    parseRestInput(squadEmptyQuerySchema, request.query)
    const pusher = dependencies.config.pusher
    response.set('Cache-Control', 'public, max-age=300')
    response.json(
      squadRealtimeConfigSchema.parse({
        pusher: pusher ? { key: pusher.key, cluster: pusher.cluster } : null,
      }),
    )
  })

// Pusher's private-channel handshake: signs the socket in when the caller has a seat.
export const realtimeAuthHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(squadEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const input = parseRestInput(squadRealtimeAuthSchema, request.body)
    response.set('Cache-Control', 'no-store')
    response.json(
      squadRealtimeAuthResponseSchema.parse(await authorizeRoomChannel(context.db, actor, input)),
    )
  })
