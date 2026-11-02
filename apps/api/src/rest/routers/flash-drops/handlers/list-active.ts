import { listActiveFlashDrops } from '@api/modules/flash-drops/public'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  activeFlashDropsResponseSchema,
  flashDropEmptyQuerySchema,
} from '@broke-oclock/contracts/flash-drops'

// Public: approved drops running right now. Short-lived, so browsers never cache it.
export const listActive = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    response.set('Cache-Control', 'no-store')
    response.json(
      activeFlashDropsResponseSchema.parse(await listActiveFlashDrops(context.db, new Date())),
    )
  })
