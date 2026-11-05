import type { AdminDealDetail } from '@broke-oclock/contracts/admin-deals'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { adminDeal, fakeAdminDeals } from './admin-deal-fixtures'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { hex } from './fake-backend'

const SOURCE = 'Synthetic MoneyDigest'
const imported = (id: number, title: string) =>
  adminDeal(hex(id), title, {
    origin: 'IMPORTED',
    submittedById: null,
    scopeEvidenceLabel: 'Source post lists the outlet',
    sources: [
      {
        citationId: hex(id + 100),
        sourceUrl: `https://synthetic-source.invalid/posts/${id}`,
        sourceContentHash: 'a'.repeat(64),
        sourceContentSnapshot: `${title} at Synthetic Ah Seng (Maxwell).`,
        current: true,
      },
    ],
  })
const IMPORTS = [
  imported(51, 'Synthetic 1-for-1 bubble tea'),
  imported(52, 'Synthetic $2 kopi set'),
]

const toDraft = (deal: AdminDealDetail) => ({
  id: deal.id,
  title: deal.title,
  description: deal.description,
  terms: deal.terms,
  category: deal.category,
  offerType: deal.offerType,
  priceMinor: deal.priceMinor,
  currency: deal.currency,
  discountPercent: deal.discountPercent,
  validFrom: deal.validFrom,
  validUntil: deal.validUntil,
  rawValidityText: deal.rawValidityText,
  applicability: deal.applicability,
  merchantId: deal.merchantId,
  outlet: null,
  outlets: deal.outlets.map(({ id, name, address }) => ({
    id,
    name,
    address,
    merchantName: 'Synthetic Ah Seng',
  })),
  outletCount: deal.outletCount,
  reviewStatus: deal.reviewStatus,
  operationVersion: deal.operationVersion,
  contentVersion: deal.contentVersion,
  sourceUrl: deal.sources[0]?.sourceUrl ?? '',
  sourceName: SOURCE,
  reviewNote: deal.reviewNote,
  reviewReady: true,
})

const fakeIngestion = async (page: Page) => {
  const store = await fakeAdminDeals(page, IMPORTS)
  const count = (status: string) =>
    store.deals().filter((deal) => deal.reviewStatus === status).length
  store.backend.on('GET', '/api/ingestion/dashboard', () => ({
    json: {
      source: { name: SOURCE, enabled: true, reuseApproved: true, onemapConfigured: true },
      counts: {
        pending: count('PENDING'),
        approved: count('APPROVED'),
        rejected: count('REJECTED'),
        failed: 0,
      },
    },
  }))
  store.backend.on('GET', '/api/ingestion/drafts', ({ query }) => ({
    json: {
      items: store
        .deals()
        .filter((deal) => deal.reviewStatus === (query.get('status') ?? 'PENDING'))
        .map(toDraft),
      nextCursor: null,
    },
  }))
  return store
}

const queue = (page: Page) => page.getByRole('region', { name: 'Imported deals' })
const importCard = (page: Page, title: string) =>
  queue(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title }) })

test('an admin reviews an imported deal in Deals and it leaves the pending imports', async ({
  page,
}) => {
  const { backend } = await fakeIngestion(page)
  await page.goto('/admin/ingestion')

  await expect(queue(page).getByRole('heading', { level: 3 })).toHaveText(
    IMPORTS.map((deal) => deal.title),
  )
  const card = importCard(page, 'Synthetic 1-for-1 bubble tea')
  await expect(card).toContainText(SOURCE)
  await card.getByRole('link', { name: /Open in Deals/ }).click()

  await expect(page).toHaveURL(new RegExp(`/admin/deals\\?.*dealId=${IMPORTS[0]?.id}`))
  await expect(
    page.getByRole('heading', { level: 2, name: 'Synthetic 1-for-1 bubble tea' }),
  ).toBeVisible()
  await expect(page.getByText('Imported deal', { exact: true })).toBeVisible()

  await page
    .getByRole('tablist', { name: 'Deal workspace' })
    .getByRole('tab', { name: 'Review' })
    .click()
  await expect(page.getByText('This approval will publish the deal.')).toBeVisible()
  await page.getByLabel('Required reason').fill('Source post confirms the offer and outlet.')
  await page.getByRole('checkbox', { name: /^I confirm/ }).check()
  await page.getByTestId('save-operation').click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  expect(backend.callsTo('POST', /\/review$/).at(-1)?.body).toMatchObject({ decision: 'APPROVE' })

  await page.getByRole('link', { name: '← Back to previous task' }).click()
  await expect(page).toHaveURL(/\/admin\/ingestion\?status=PENDING/)
  await expect(
    page.getByText('The linked imported deal is no longer on this page.', { exact: false }),
  ).toBeVisible()
  await expect(importCard(page, 'Synthetic 1-for-1 bubble tea')).toHaveCount(0)
  await expect(importCard(page, 'Synthetic $2 kopi set')).toBeVisible()

  await chooseOption(queue(page).getByRole('combobox', { name: 'Review status' }), 'APPROVED')
  await expect(importCard(page, 'Synthetic 1-for-1 bubble tea')).toBeVisible()
  await expect(importCard(page, 'Synthetic $2 kopi set')).toHaveCount(0)
})
