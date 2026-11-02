import { listNearbyPeople } from '@api/modules/presence/presence'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { nearbyPeopleResponseSchema, presenceQuerySchema } from '@broke-oclock/contracts/presence'

// Public and read-only: who is shown around a point, anonymously, without the viewer.
export const listNearby = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const centre = parseRestInput(presenceQuerySchema, request.query)
    const viewer = context.session?.user.id ?? null
    response.json(
      nearbyPeopleResponseSchema.parse(
        await listNearbyPeople(context.db, viewer, centre, new Date()),
      ),
    )
  })
