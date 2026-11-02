import { listMerchantFlashDrops } from '@api/modules/flash-drops/merchant'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  flashDropEmptyQuerySchema,
  merchantFlashDropsResponseSchema,
} from '@broke-oclock/contracts/flash-drops'

export const listMerchantDrops = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const { userId } = authenticatedActor(requireSession(context))
    response.set('Cache-Control', 'no-store')
    response.json(
      merchantFlashDropsResponseSchema.parse({
        items: await listMerchantFlashDrops(context.db, userId, new Date()),
      }),
    )
  })
