import { DomainError } from '@api/modules/domain-error'
import { requireMerchant } from '@api/modules/flash-drops/merchant'
import { authorizeMerchantFlashChannel } from '@api/modules/flash-drops/realtime'
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
  flashDropEmptyQuerySchema,
  flashRealtimeConfigSchema,
  merchantFlashChannelFor,
  merchantFlashRealtimeAuthResponseSchema,
  merchantFlashRealtimeAuthSchema,
} from '@broke-oclock/contracts/flash-drops'

export const flashRealtimeConfig = (dependencies: RestDependencies) =>
  createPublicRestHandler(dependencies, async (request, response) => {
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const pusher = dependencies.config.pusher
    response.set('Cache-Control', 'public, max-age=300')
    response.json(
      flashRealtimeConfigSchema.parse({
        pusher: pusher ? { key: pusher.key, cluster: pusher.cluster } : null,
      }),
    )
  })

export const merchantFlashRealtimeAuth = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const input = parseRestInput(merchantFlashRealtimeAuthSchema, request.body)
    await requireMerchant(context.db, actor.userId)
    if (input.channel !== merchantFlashChannelFor(actor.userId)) throw new DomainError('FORBIDDEN')
    const signed = authorizeMerchantFlashChannel(input.socketId, actor.userId)
    if (!signed) throw new DomainError('PRECONDITION_FAILED', 'Live updates are not configured')
    response.set('Cache-Control', 'no-store')
    response.json(merchantFlashRealtimeAuthResponseSchema.parse({ auth: signed.auth }))
  })
