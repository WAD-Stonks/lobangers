import { normalizeVersion } from '@api/modules/platform-admin/operation-version'
import type { Database } from '@api/modules/platform-admin/transaction'
import type { AdminDealsQuery } from '@broke-oclock/contracts/admin-deals'
import { adminDealsQuerySchema } from '@broke-oclock/contracts/admin-deals'

type DealWhere = NonNullable<Parameters<Database['deal']['findMany']>[0]>['where']
export const publicationState = (
  deal: {
    deletedAt: Date | null
    reviewStatus: string
    publishedAt: Date | null
    validUntil: Date | null
  },
  now = new Date(),
) =>
  deal.deletedAt
    ? ('DELETED' as const)
    : deal.reviewStatus === 'HIDDEN'
      ? ('HIDDEN' as const)
      : deal.validUntil && deal.validUntil <= now
        ? ('EXPIRED' as const)
        : deal.reviewStatus === 'APPROVED' && deal.publishedAt
          ? ('PUBLISHED' as const)
          : ('UNPUBLISHED' as const)
export const summary = (deal: Awaited<ReturnType<Database['deal']['findUniqueOrThrow']>>) => ({
  id: deal.id,
  title: deal.title,
  origin: deal.origin,
  reviewStatus: deal.reviewStatus,
  contentVersion: deal.contentVersion,
  operationVersion: normalizeVersion(deal.operationVersion),
  merchantId: deal.merchantId,
  deletedAt: deal.deletedAt?.toISOString() ?? null,
  publishedAt: deal.publishedAt?.toISOString() ?? null,
  validFrom: deal.validFrom?.toISOString() ?? null,
  validUntil: deal.validUntil?.toISOString() ?? null,
  publication: publicationState(deal),
})
export const listAdminDeals = async (db: Database, raw: AdminDealsQuery) => {
  const input = adminDealsQuerySchema.parse(raw)
  const and: NonNullable<DealWhere>[] = []
  if (input.includeDeleted !== 'true')
    and.push({ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] })
  if (input.search)
    and.push({
      OR: [
        { title: { contains: input.search, mode: 'insensitive' } },
        { description: { contains: input.search, mode: 'insensitive' } },
      ],
    })
  if (input.origin) and.push({ origin: input.origin })
  if (input.reviewStatus) and.push({ reviewStatus: input.reviewStatus })
  if (input.merchantId) and.push({ merchantId: input.merchantId })
  if (input.cursor) and.push({ id: { lt: input.cursor } })
  if (input.publication === 'EXPIRED') and.push({ validUntil: { not: null, lte: new Date() } })
  if (input.publication === 'PUBLISHED')
    and.push({
      reviewStatus: 'APPROVED',
      publishedAt: { not: null },
      OR: [
        { validUntil: null },
        { validUntil: { isSet: false } },
        { validUntil: { gt: new Date() } },
      ],
    })
  if (input.publication === 'UNPUBLISHED')
    and.push({ OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] })
  const rows = await db.deal.findMany({
    where: { AND: and },
    orderBy: { id: 'desc' },
    take: input.limit + 1,
  })
  const items = rows.slice(0, input.limit).map(summary)
  return { items, nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null }
}
