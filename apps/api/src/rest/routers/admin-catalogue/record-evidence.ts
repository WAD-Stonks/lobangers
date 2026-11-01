import { recordCatalogueEvidence } from '@api/modules/venues/evidence'
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
  recordCatalogueEvidenceSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const recordAdminCatalogueEvidence = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueMutationResponseSchema.parse(
          await recordCatalogueEvidence(
            context.db,
            authenticatedActor(session),
            parseRestValue(catalogueIdSchema, request.params).id,
            parseRestValue(recordCatalogueEvidenceSchema, request.body),
          ),
        ),
      )
  })
