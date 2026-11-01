import { ApiErrorException } from '@api/errors'
import { answerChat } from '@api/modules/assistant/chat'
import {
  generateWithFallback,
  modelErrorCode,
  providerOrder,
} from '@api/modules/assistant/providers'
import { findPublicDealPins } from '@api/modules/deals/public-deals'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  assistantChatBodySchema,
  assistantChatQuerySchema,
  assistantChatResponseSchema,
} from '@broke-oclock/contracts/assistant'

export const chatWithAssistant = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(assistantChatQuerySchema, request.query)
    const body = parseRestInput(assistantChatBodySchema, request.body)

    const runtime = dependencies.assistant
    if (!runtime || providerOrder(runtime.providers, runtime.provider).length === 0)
      throw new ApiErrorException('BAD_GATEWAY', 'Lobbie is not available right now')
    const visitor =
      context.session?.user.id ??
      (runtime.clientIpHeader ? request.get(runtime.clientIpHeader) : undefined) ??
      request.ip ??
      'anonymous'
    if (!runtime.limiter.take(visitor))
      throw new ApiErrorException('TOO_MANY_REQUESTS', 'Lobbie needs a short breather')

    const now = runtime.now()
    const deals = await findPublicDealPins(
      context.db,
      { validNow: 'true' },
      now,
      dependencies.config.community,
    )
    try {
      const answer = await answerChat({
        deals,
        messages: body.messages,
        position: body.position,
        filters: body.filters,
        now,
        generate: async (modelRequest) =>
          (await generateWithFallback(runtime.providers, runtime.provider, modelRequest)).output,
      })
      response.json(assistantChatResponseSchema.parse(answer))
    } catch (error) {
      const code = modelErrorCode(error)
      if (code === null) throw error
      console.warn(`[api] Lobbie: ${runtime.provider} failed with ${code}`)
      throw code === 'RATE_LIMITED'
        ? new ApiErrorException('TOO_MANY_REQUESTS', 'Lobbie is busy right now')
        : new ApiErrorException('BAD_GATEWAY', 'Lobbie could not answer right now')
    }
  })
