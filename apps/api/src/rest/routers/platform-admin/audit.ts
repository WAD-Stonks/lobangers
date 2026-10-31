import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { page, parseRestValue } from '@api/rest/routers/platform-admin/validation'
import { adminAuditDetailsSchema } from '@broke-oclock/contracts/admin-common'
import {
  platformAuditEntrySchema,
  platformAuditQuerySchema,
  platformPageSchema,
} from '@broke-oclock/contracts/platform-admin'

export const listPlatformAudit = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    response.set('Cache-Control', 'no-store')
    await requireAdmin(context, 'FORBIDDEN')
    const input = parseRestValue(platformAuditQuerySchema, request.query)
    const rows = await context.db.platformAudit.findMany({
      where: {
        targetUserId: input.userId,
        actorId: input.actorId,
        action: input.action,
        ...(input.subjectType === 'USER'
          ? {
              OR: [
                { subjectType: 'USER', subjectId: input.subjectId },
                {
                  AND: [
                    { OR: [{ subjectType: null }, { subjectType: { isSet: false } }] },
                    { targetUserId: input.subjectId ?? { not: null } },
                  ],
                },
              ],
            }
          : { subjectType: input.subjectType, subjectId: input.subjectId }),
        ...(input.from && input.until
          ? { createdAt: { gte: new Date(input.from), lt: new Date(input.until) } }
          : {}),
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      take: input.limit + 1,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        actorId: true,
        actorName: true,
        action: true,
        targetUserId: true,
        subjectType: true,
        subjectId: true,
        detailsJson: true,
        venueId: true,
        note: true,
        roleBefore: true,
        roleAfter: true,
        createdAt: true,
      },
    })
    response.json(
      platformPageSchema(platformAuditEntrySchema).parse(
        page(
          rows.map((row) => {
            const details = adminAuditDetailsSchema.safeParse(row.detailsJson)
            return {
              ...row,
              detailsJson: details.success ? details.data : null,
              createdAt: row.createdAt.toISOString(),
            }
          }),
          input.limit,
        ),
      ),
    )
  })
