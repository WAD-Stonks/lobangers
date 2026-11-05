import { requireActiveSessionWrite } from '@api/modules/account/security-access'
import { accessTransaction } from '@api/modules/platform-admin/transaction'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { bookmarkParamsSchema } from '@broke-oclock/contracts/account'

export const deleteBookmark = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)

    const session = requireSession(context)
    const { dealId } = parseRestInput(bookmarkParamsSchema, request.params)

    await accessTransaction(context.db, async (tx) => {
      await requireActiveSessionWrite(tx, authenticatedActor(session))
      await tx.bookmark.deleteMany({
        where: { userId: session.user.id, dealId },
      })
    })
    response.json({ saved: false })
  })
