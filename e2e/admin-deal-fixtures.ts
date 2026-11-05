import type { AdminDealDetail } from '@broke-oclock/contracts/admin-deals'
import type { Page } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend, hex } from './fake-backend'

export const ADMIN = account('ADMIN', { name: 'Synthetic operator' })
export const at = '2026-10-30T08:00:00.000Z'
const MERCHANT_ID = hex(71)

export const adminDeal = (
  id: string,
  title: string,
  overrides: Partial<AdminDealDetail> = {},
): AdminDealDetail => ({
  id,
  title,
  origin: 'USER_SUBMITTED',
  reviewStatus: 'PENDING',
  contentVersion: 1,
  operationVersion: 0,
  merchantId: MERCHANT_ID,
  deletedAt: null,
  publishedAt: null,
  validFrom: '2026-11-01T00:00:00.000Z',
  validUntil: '2026-12-31T16:00:00.000Z',
  publication: 'UNPUBLISHED',
  description: 'Buy one plate, get the second free.',
  terms: 'Dine-in only',
  category: 'FOOD',
  cuisine: 'CHINESE',
  offerType: 'BUY_ONE_GET_ONE',
  priceMinor: null,
  currency: 'SGD',
  discountPercent: null,
  rawValidityText: null,
  applicability: 'SELECTED_OUTLETS',
  submittedById: hex(21),
  reviewedById: null,
  reviewedVersion: null,
  reviewedAt: null,
  reviewNote: null,
  sources: [],
  images: [],
  outlets: [
    {
      id: hex(81),
      name: 'Synthetic Ah Seng (Maxwell)',
      address: '1 Synthetic St',
      merchantId: MERCHANT_ID,
      deletedAt: null,
      geographyReady: true,
      occupancyReady: true,
    },
  ],
  outletCount: 1,
  selectedVenueIds: [hex(81)],
  nextOutletCursor: null,
  scopeEditable: true,
  scopeConfirmed: true,
  blockers: [],
  approvalReady: true,
  publicationReady: true,
  scopeEvidenceLabel: 'Member photo of the poster',
  ...overrides,
})

const summary = (deal: AdminDealDetail) => ({
  id: deal.id,
  title: deal.title,
  origin: deal.origin,
  reviewStatus: deal.reviewStatus,
  contentVersion: deal.contentVersion,
  operationVersion: deal.operationVersion,
  merchantId: deal.merchantId,
  deletedAt: deal.deletedAt,
  publishedAt: deal.publishedAt,
  validFrom: deal.validFrom,
  validUntil: deal.validUntil,
  publication: deal.publication,
})

export const fakeAdminDeals = async (page: Page, seed: readonly AdminDealDetail[]) => {
  const backend = await fakeBackend(page, { user: ADMIN })
  let deals = structuredClone([...seed])
  const conflict = {
    status: 409,
    json: { error: { code: 'CONFLICT', message: 'Version changed' } },
  }
  const find = (path: string) => deals.find((deal) => path.includes(deal.id))
  const save = (next: AdminDealDetail) => {
    deals = deals.map((deal) => (deal.id === next.id ? next : deal))
    return { json: next }
  }
  const stale = (
    deal: AdminDealDetail,
    body: { expectedContentVersion: number; expectedOperationVersion: number },
  ) =>
    body.expectedContentVersion !== deal.contentVersion ||
    body.expectedOperationVersion !== deal.operationVersion

  backend.on('GET', '/api/admin/deals', ({ query }) => {
    const status = query.get('reviewStatus')
    const search = (query.get('search') ?? '').toLowerCase()
    return {
      json: {
        items: deals
          .filter((deal) => !status || deal.reviewStatus === status)
          .filter((deal) => deal.title.toLowerCase().includes(search))
          .map(summary),
        nextCursor: null,
      },
    }
  })
  backend.on('GET', /^\/api\/admin\/deals\/[0-9a-f]{24}$/, ({ path }) => {
    const deal = find(path)
    return deal ? { json: deal } : undefined
  })
  backend.on('PATCH', /^\/api\/admin\/deals\/[0-9a-f]{24}\/content$/, ({ path, body }) => {
    const deal = find(path)
    if (!deal) return undefined
    if (stale(deal, body)) return conflict
    return save({
      ...deal,
      ...body.changes,
      contentVersion: deal.contentVersion + 1,
      reviewStatus: 'PENDING',
    })
  })
  backend.on('POST', /^\/api\/admin\/deals\/[0-9a-f]{24}\/review$/, ({ path, body }) => {
    const deal = find(path)
    if (!deal) return undefined
    if (stale(deal, body)) return conflict
    const approved = body.decision === 'APPROVE'
    return save({
      ...deal,
      reviewStatus: approved ? 'APPROVED' : 'REJECTED',
      publication: approved ? 'PUBLISHED' : 'UNPUBLISHED',
      publishedAt: approved ? new Date().toISOString() : null,
      operationVersion: deal.operationVersion + 1,
      reviewedVersion: deal.contentVersion,
      reviewNote: body.note,
    })
  })
  const changeBehindTheAdminsBack = (id: string, title: string) => {
    const deal = deals.find((item) => item.id === id)
    if (deal) save({ ...deal, title, contentVersion: deal.contentVersion + 1 })
  }
  return { backend, changeBehindTheAdminsBack, deals: () => deals }
}
