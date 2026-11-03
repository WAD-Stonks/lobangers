import { ApiErrorException } from '@api/errors'
import { authorizeIngestionChannel } from '@api/modules/ingestion/realtime'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionRealtimeAuthResponseSchema,
  ingestionRealtimeAuthSchema,
  ingestionRealtimeConfigSchema,
} from '@broke-oclock/contracts/ingestion'
import { z } from 'zod'

export const ingestionRealtimeConfig = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    parseRestInput(z.object({}).strict(), request.query)
    const config = dependencies.config.pusher
    response.set('Cache-Control', 'no-store')
    response.json(
      ingestionRealtimeConfigSchema.parse({
        pusher: config ? { key: config.key, cluster: config.cluster } : null,
      }),
    )
  })
export const ingestionRealtimeAuth = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(z.object({}).strict(), request.query)
    const input = parseRestInput(ingestionRealtimeAuthSchema, request.body)
    const signed = authorizeIngestionChannel(input.socketId)
    if (!signed)
      throw new ApiErrorException('PRECONDITION_FAILED', 'Live progress is not configured')
    response.set('Cache-Control', 'no-store')
    response.json(ingestionRealtimeAuthResponseSchema.parse({ auth: signed.auth }))
  })
