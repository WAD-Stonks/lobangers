import { listMerchantDeals } from '@api/modules/merchant/promotions'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  merchantDealsResponseSchema,
  merchantEmptyQuerySchema,
} from '@broke-oclock/contracts/merchant'

// The deals this merchant created through the dashboard, newest first.
export const listDeals = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const userId = requireSession(context).user.id
    const items = await listMerchantDeals(context.db, userId, new Date())
    response.json(merchantDealsResponseSchema.parse({ items }))
  })
