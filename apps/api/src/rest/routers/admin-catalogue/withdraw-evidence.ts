import { withdrawCatalogueEvidence } from '@api/modules/venues/evidence'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  catalogueIdSchema,
  catalogueMutationResponseSchema,
  withdrawCatalogueEvidenceSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const withdrawAdminCatalogueEvidence = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueMutationResponseSchema.parse(
          await withdrawCatalogueEvidence(
            context.db,
            authenticatedActor(session),
            parseRestValue(catalogueIdSchema, request.params).id,
            parseRestValue(withdrawCatalogueEvidenceSchema, request.body),
          ),
        ),
      )
  })
