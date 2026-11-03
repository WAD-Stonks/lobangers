import { listActiveFlashDrops } from '@api/modules/flash-drops/public'
import { createPublicRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  activeFlashDropsResponseSchema,
  flashDropEmptyQuerySchema,
} from '@broke-oclock/contracts/flash-drops'

// Public: approved drops running right now. Short-lived, so browsers never cache it. The map
// polls this anonymously, so it skips the session lookup and its database round trips.
export const listActive = (dependencies: RestDependencies) =>
  createPublicRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    response.set('Cache-Control', 'no-store')
    response.json(
      activeFlashDropsResponseSchema.parse(await listActiveFlashDrops(context.db, new Date())),
    )
  })
