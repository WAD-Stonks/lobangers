import { isPubliclyVisible, publicDealVisibilitySelect } from '@api/modules/account/visibility'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { page } from '@api/rest/routers/platform-admin/validation'
import { parseRestInput } from '@api/rest/validation'
import {
  accountPageQuerySchema,
  type Bookmark,
  bookmarksResponseSchema,
} from '@broke-oclock/contracts/account'

export const listBookmarks = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = requireSession(context)
    const input = parseRestInput(accountPageQuerySchema, request.query)

    const cursorFilter = input.cursor ? { id: { lt: input.cursor } } : {}

    const rows = await context.db.bookmark.findMany({
      where: { userId: session.user.id, ...cursorFilter },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      select: {
        id: true,
        dealId: true,
        createdAt: true,
        deal: {
          select: {
            ...publicDealVisibilitySelect,
            title: true,
            category: true,
            description: true,
            validUntil: true,
            reviewStatus: true,
            deletedAt: true,
            publishedAt: true,
            contentVersion: true,
            reviewedVersion: true,
          },
        },
      },
    })

    const items: Bookmark[] = []
    for (const row of rows) {
      const deal = row.deal
      if (isPubliclyVisible(deal)) {
        items.push({
          id: row.id,
          dealId: row.dealId,
          savedAt: row.createdAt.toISOString(),
          deal: {
            title: deal.title,
            category: deal.category,
            description: deal.description,
            validUntil: deal.validUntil ? deal.validUntil.toISOString() : null,
          },
        })
      } else {
        items.push({
          id: row.id,
          dealId: row.dealId,
          savedAt: row.createdAt.toISOString(),
          deal: null,
        })
      }
    }

    response.json(bookmarksResponseSchema.parse(page(items, input.limit)))
  })
