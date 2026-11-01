import { listMerchantOutlets } from '@api/modules/merchant/promotions'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  merchantEmptyQuerySchema,
  merchantOutletsResponseSchema,
} from '@broke-oclock/contracts/merchant'

// The outlets this merchant may create deals for (active stall grants only).
export const listOutlets = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const userId = requireSession(context).user.id
    const items = await listMerchantOutlets(context.db, userId)
    response.json(merchantOutletsResponseSchema.parse({ items }))
  })
