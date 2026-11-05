import { listActiveFlashDrops } from '@api/modules/flash-drops/public'
import { createPublicRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  activeFlashDropsResponseSchema,
  flashDropEmptyQuerySchema,
} from '@broke-oclock/contracts/flash-drops'

export const listActive = (dependencies: RestDependencies) =>
  createPublicRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    response.set('Cache-Control', 'no-store')
    response.json(
      activeFlashDropsResponseSchema.parse(await listActiveFlashDrops(context.db, new Date())),
    )
  })
