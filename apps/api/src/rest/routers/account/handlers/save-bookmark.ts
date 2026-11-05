import { ApiErrorException } from '@api/errors'
import { requireActiveSessionWrite } from '@api/modules/account/security-access'
import { isPubliclyVisible, publicDealVisibilitySelect } from '@api/modules/account/visibility'
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

export const saveBookmark = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)

    const session = requireSession(context)
    const userId = session.user.id

    const { dealId } = parseRestInput(bookmarkParamsSchema, request.params)

    await accessTransaction(context.db, async (tx) => {
      await requireActiveSessionWrite(tx, authenticatedActor(session))
      const deal = await tx.deal.findUnique({
        where: { id: dealId },
        select: publicDealVisibilitySelect,
      })
      if (!deal || !isPubliclyVisible(deal)) {
        throw new ApiErrorException('NOT_FOUND')
      }

      await tx.bookmark.upsert({
        where: { userId_dealId: { userId, dealId } },
        create: { userId, dealId },
        update: {},
      })
    })
    response.json({ saved: true })
  })
