import { listAdminFlashDrops } from '@api/modules/flash-drops/admin'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  adminFlashDropsQuerySchema,
  adminFlashDropsResponseSchema,
} from '@broke-oclock/contracts/flash-drops'

export const listAdminDrops = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const actor = authenticatedActor(requireSession(context))
    const { view } = parseRestInput(adminFlashDropsQuerySchema, request.query)
    response.json(
      adminFlashDropsResponseSchema.parse(
        await listAdminFlashDrops(context.db, actor, view, new Date()),
      ),
    )
  })
