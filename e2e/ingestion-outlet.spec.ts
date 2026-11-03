import {
  type CatalogueMerchant,
  type CatalogueVenue,
  catalogueMerchantSchema,
  catalogueVenueDetailSchema,
  catalogueVenuesResponseSchema,
} from '@broke-oclock/contracts/admin-catalogue'
import {
  type AdminDealDetail,
  adminDealDetailSchema,
  adminDealReviewRequestSchema,
  adminDealScopeEvidenceRequestSchema,
  adminDealScopeRequestSchema,
  adminDealSummarySchema,
  adminDealsResponseSchema,
} from '@broke-oclock/contracts/admin-deals'
import type { IngestionDashboardResponse, IngestionDraft } from '@broke-oclock/contracts/ingestion'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

// Real SPA, router, Axios and contract parsers; all network data and writes are synthetic.
// Native authorization and actual publication are covered by disposable HTTP integration tests.
const id = '111111111111111111111111'
const otherId = '222222222222222222222222'
const merchantId = '444444444444444444444444'
const citationId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const sourceHash = 'b'.repeat(64)
const sourceUrl = 'https://example.test/source/offer#complete-scope'
const returnTo = `/admin/ingestion?status=PENDING&draftId=${id}#queue-title`
const merchant: CatalogueMerchant = {
  id: merchantId,
  name: 'Synthetic merchant',
  version: 3,
  archived: false,
  venueCount: 2,
  dealCount: 1,
}
const venue: CatalogueVenue = {
  id: '333333333333333333333333',
  merchantId,
  merchantName: merchant.name,
  parentArchived: false,
  name: 'Synthetic existing outlet',
  address: '123 SYNTHETIC ROAD',
  postalCode: '123456',
  area: 'Synthetic area',
  latitude: 1.3,
  longitude: 103.8,
  imageUrl: null,
  geographyPrecision: 'OUTLET',
  catalogueKey: 'synthetic:existing',
  version: 4,
  archived: false,
  selectable: true,
  geographyVerified: true,
  occupancyVerified: true,
  geographyState: 'VERIFIED',
  occupancyState: 'VERIFIED',
  dealCount: 1,
  grantCount: 0,
  requestCount: 0,
}
const secondVenue: CatalogueVenue = {
  ...venue,
  id: '555555555555555555555555',
  name: 'Synthetic additional outlet',
  catalogueKey: 'synthetic:additional',
}
const dealOutlet = (row: CatalogueVenue): AdminDealDetail['outlets'][number] => ({
  id: row.id,
  merchantId: row.merchantId,
  name: row.name,
  address: row.address,
  deletedAt: null,
  geographyReady: row.geographyVerified,
  occupancyReady: row.occupancyVerified,
})
const initial: AdminDealDetail = {
  id,
  title: 'Synthetic imported outlet offer',
  origin: 'IMPORTED',
  reviewStatus: 'PENDING',
  contentVersion: 7,
  operationVersion: 0,
  merchantId,
  deletedAt: null,
  publishedAt: null,
  validFrom: '2099-01-01T00:00:00Z',
  validUntil: '2099-12-01T00:00:00Z',
  publication: 'UNPUBLISHED',
  description: '<script>unsafe()</script>',
  terms: 'Synthetic terms',
  category: 'FOOD',
  cuisine: null,
  offerType: 'OTHER',
  priceMinor: null,
  currency: 'SGD',
  discountPercent: null,
  rawValidityText: 'Synthetic source dates',
  applicability: 'SELECTED_OUTLETS',
  submittedById: null,
  reviewedById: null,
  reviewedVersion: null,
  reviewedAt: null,
  reviewNote: null,
  sources: [
    {
      citationId,
      sourceUrl,
      sourceContentHash: sourceHash,
      sourceContentSnapshot: 'Synthetic original source explicitly lists both outlets.',
      current: true,
    },
  ],
  images: [],
  outlets: [dealOutlet(venue)],
  outletCount: 1,
  selectedVenueIds: [venue.id],
  nextOutletCursor: null,
  scopeEditable: true,
  scopeConfirmed: false,
  blockers: ['SCOPE_EVIDENCE_REQUIRED'],
  approvalReady: true,
  publicationReady: false,
  scopeEvidenceLabel: null,
}
const summary = (row: AdminDealDetail) =>
  adminDealSummarySchema.parse(
    Object.fromEntries(
      Object.keys(adminDealSummarySchema.shape).map((key) => [
        key,
        row[key as keyof AdminDealDetail],
      ]),
    ),
  )
const draft = (row: AdminDealDetail): IngestionDraft => ({
  id: row.id,
  title: row.title,
  description: row.description,
  terms: row.terms,
  category: 'FOOD',
  offerType: row.offerType,
  validFrom: row.validFrom,
  validUntil: row.validUntil,
  rawValidityText: row.rawValidityText,
  applicability: row.applicability,
  merchantId: row.merchantId,
  outlet: { id: venue.id, name: venue.name, address: venue.address, merchantName: merchant.name },
  reviewStatus: row.reviewStatus,
  contentVersion: row.contentVersion,
  operationVersion: row.operationVersion,
  sourceUrl,
  sourceName: 'Named synthetic source',
  reviewNote: row.reviewNote,
  reviewReady: row.approvalReady,
})
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
async function boundary(page: Page) {
  const scope = deferred()
  const calls: { method: string; path: string; query: Record<string, string>; body: unknown }[] = []
  const events: { event: string; code?: string }[] = []
  const pageErrors: string[] = []
  const consoleMessages: { type: string; text: string }[] = []
  const unexpected: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      consoleMessages.push({ type: message.type(), text: message.text() })
  })
  const state = {
    current: structuredClone(initial),
    failure: '' as '' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR' | 'FORBIDDEN',
    denied: false,
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method()
    const body: unknown = request.postDataJSON()
    calls.push({ method, path, query: Object.fromEntries(url.searchParams), body })
    const reply = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    const fail = (code: typeof state.failure) => {
      events.push({ event: 'synthetic-error', code })
      return reply(
        { error: { code, message: 'Synthetic boundary failure' } },
        code === 'CONFLICT' ? 409 : code === 'FORBIDDEN' ? 403 : 500,
      )
    }
    if (path === '/api/auth/get-session')
      return reply({
        user: {
          id: 'synthetic-admin',
          name: 'Synthetic operator',
          email: 'operator@example.test',
          role: 'USER',
        },
        session: {
          id: 'synthetic-session',
          userId: 'synthetic-admin',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      })
    if (path === '/api/ingestion/dashboard')
      return reply({
        source: {
          name: 'Named synthetic source',
          enabled: false,
          reuseApproved: false,
          onemapConfigured: false,
        },
        counts: {
          pending: state.current.reviewStatus === 'PENDING' ? 1 : 0,
          approved: state.current.reviewStatus === 'APPROVED' ? 1 : 0,
          rejected: 0,
          failed: 0,
        },
      } satisfies IngestionDashboardResponse)
    if (path === '/api/ingestion/drafts' && method === 'GET')
      return reply({
        items:
          state.current.reviewStatus === (url.searchParams.get('status') ?? 'PENDING')
            ? [draft(state.current)]
            : [],
        nextCursor: null,
      })
    if (
      path === '/api/ingestion/posts' ||
      path === '/api/ingestion/sources' ||
      /^\/api\/ingestion\/drafts\/[a-f0-9]{24}\/evidence$/u.test(path)
    )
      return reply({ items: [], nextCursor: null })
    if (path === '/api/ingestion/runs') return reply({ items: [] })
    if (path === '/api/ingestion/accounts') return reply({ items: [], nextCursor: null })
    if (path === '/api/admin/deals' && method === 'GET')
      return reply(
        adminDealsResponseSchema.parse({
          items: [summary({ ...initial, id: otherId, title: 'Synthetic other deal' })],
          nextCursor: null,
        }),
      )
    if (path === `/api/admin/deals/${id}` && method === 'GET') {
      events.push({ event: 'exact-deal-read' })
      if (state.denied) return fail('FORBIDDEN')
      return reply(adminDealDetailSchema.parse(state.current))
    }
    if (path === `/api/admin/deals/${otherId}` && method === 'GET')
      return reply(
        adminDealDetailSchema.parse({ ...initial, id: otherId, title: 'Synthetic other deal' }),
      )
    if (path === `/api/admin/catalogue/merchants/${merchantId}`)
      return reply(catalogueMerchantSchema.parse(merchant))
    if (path === '/api/admin/catalogue/venues')
      return reply(
        catalogueVenuesResponseSchema.parse({
          items: url.searchParams.has('search') ? [secondVenue] : [venue, secondVenue],
          nextCursor: null,
        }),
      )
    if (path === `/api/admin/catalogue/venues/${venue.id}`)
      return reply(
        catalogueVenueDetailSchema.parse({ ...venue, evidence: [], evidenceTruncated: false }),
      )
    if (path === `/api/admin/deals/${id}/scope` && method === 'PATCH') {
      const input = adminDealScopeRequestSchema.parse(body)
      events.push({ event: 'scope-start' })
      await scope.promise
      if (state.failure) {
        if (state.failure === 'FORBIDDEN') state.denied = true
        return fail(state.failure)
      }
      state.current = {
        ...state.current,
        applicability: input.applicability,
        merchantId: input.merchantId,
        selectedVenueIds: input.venueIds,
        outlets: [venue, secondVenue]
          .filter((row) => input.venueIds.includes(row.id))
          .map(dealOutlet),
        outletCount: input.venueIds.length,
        contentVersion: 8,
        operationVersion: 1,
        scopeConfirmed: false,
      }
      events.push({ event: 'scope-result' })
      return reply(adminDealDetailSchema.parse(state.current))
    }
    if (path === `/api/admin/deals/${id}/scope-evidence` && method === 'POST') {
      adminDealScopeEvidenceRequestSchema.parse(body)
      state.current = {
        ...state.current,
        operationVersion: 2,
        scopeConfirmed: true,
        publicationReady: true,
        blockers: [],
        scopeEvidenceLabel: 'Synthetic reviewed scope evidence',
      }
      events.push({ event: 'scope-evidence-result' })
      return reply(adminDealDetailSchema.parse(state.current))
    }
    if (path === `/api/admin/deals/${id}/review` && method === 'POST') {
      const input = adminDealReviewRequestSchema.parse(body)
      state.current = {
        ...state.current,
        operationVersion: 3,
        reviewStatus: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        publication: input.decision === 'APPROVE' ? 'PUBLISHED' : 'UNPUBLISHED',
        publishedAt: input.decision === 'APPROVE' ? '2099-01-01T01:00:00Z' : null,
        reviewNote: input.note,
      }
      events.push({ event: 'review-result' })
      return reply(adminDealDetailSchema.parse(state.current))
    }
    unexpected.push(`${method} ${path}`)
    return reply({ error: { code: 'NOT_FOUND', message: 'Unmodelled synthetic route' } }, 404)
  })
  return { state, scope, calls, events, pageErrors, consoleMessages, unexpected }
}
type Boundary = Awaited<ReturnType<typeof boundary>>
const writes = (fixture: Boundary) =>
  fixture.calls.filter(
    (call) =>
      ['POST', 'PATCH', 'DELETE'].includes(call.method) && !call.path.startsWith('/api/auth/'),
  )
const note = (page: Page) => page.locator('[name="note"]')
const confirmed = (page: Page) => page.locator('[name="confirm"]')
async function open(page: Page) {
  await page.goto('/admin/ingestion')
  await expect(page.getByRole('heading', { name: 'Imported deals', exact: true })).toBeVisible()
  const link = page.getByTestId(`open-imported-${id}`)
  const target = new URL((await link.getAttribute('href')) ?? '', page.url())
  expect(target.pathname).toBe('/admin/deals')
  expect(Object.fromEntries(target.searchParams)).toEqual({ dealId: id, tab: 'content', returnTo })
  await link.focus()
  await link.press('Enter')
  await expect(page.getByRole('heading', { name: initial.title, exact: true })).toBeVisible()
  await expect(page.locator('.task-return')).toHaveAttribute('href', returnTo)
  await expect(page.getByRole('article')).toContainText(initial.description)
  await expect(page.getByRole('article').locator('script, img')).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}
async function chooseCompleteScope(page: Page) {
  await page.getByRole('tab', { name: 'Outlets & scope', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Complete selected outlet set' })).toContainText(
    venue.name,
  )
  await page.getByLabel('Outlet name or address', { exact: true }).fill('additional')
  await page.getByTestId('deal-scope-find-outlets').click()
  await page.getByTestId(`deal-scope-outlet-${secondVenue.id}`).check()
  const selected = page.getByRole('list', { name: 'Complete selected outlet set' })
  await expect(selected.locator('li')).toHaveCount(2)
  await expect(selected).toContainText(venue.name)
  await expect(selected).toContainText(secondVenue.name)
  await page.locator('summary').filter({ hasText: 'Current outlets (1)' }).click()
  const outletLink = page.getByRole('link', { name: 'Inspect outlet ↗', exact: true })
  const href = new URL((await outletLink.getAttribute('href')) ?? '', page.url())
  expect(Object.fromEntries(href.searchParams)).toMatchObject({
    kind: 'venues',
    merchantId,
    recordId: venue.id,
  })
  const back = new URL(href.searchParams.get('returnTo') ?? '', page.url())
  expect(Object.fromEntries(back.searchParams)).toMatchObject({
    dealId: id,
    tab: 'scope',
    returnTo,
  })
  await note(page).fill('Reviewed complete two-outlet scope')
  await confirmed(page).check()
}
async function snapshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
}
async function receipt(info: TestInfo, fixture: Boundary) {
  await info.attach('synthetic-canonical-workflow-receipt', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        scope: 'Real SPA/router/Axios; synthetic network data only',
        calls: fixture.calls,
        events: fixture.events,
        pageErrors: fixture.pageErrors,
        consoleMessages: fixture.consoleMessages,
        unexpected: fixture.unexpected,
      },
      null,
      2,
    ),
  })
  expect(fixture.pageErrors).toEqual([])
  expect(fixture.unexpected).toEqual([])
  const statuses = fixture.events
    .filter((event) => event.event === 'synthetic-error')
    .map((event) =>
      event.code === 'CONFLICT' ? '409' : event.code === 'FORBIDDEN' ? '403' : '500',
    )
  expect(
    fixture.consoleMessages.filter(
      (message) =>
        !(
          message.type === 'error' &&
          message.text.startsWith(
            'Failed to load resource: the server responded with a status of',
          ) &&
          statuses.some((status) => message.text.includes(status))
        ),
    ),
  ).toEqual([])
}
for (const width of [320, 390, 1280]) {
  test(`SYNTHETIC canonical imported deal scope, evidence and review at ${width}px`, async ({
    page,
  }, info) => {
    const fixture = await boundary(page)
    try {
      await page.setViewportSize({ width, height: 900 })
      await open(page)
      await chooseCompleteScope(page)
      await snapshot(page, info, `complete-scope-${width}`)
      await page.getByTestId('save-operation').click()
      await expect.poll(() => writes(fixture).length).toBe(1)
      await expect(page.getByRole('tab', { name: 'Evidence', exact: true })).toBeDisabled()
      await expect(page.locator('.admin-workspace-back')).toBeDisabled()
      await expect(page.locator('.task-return')).toHaveAttribute('aria-disabled', 'true')
      await page.locator('.task-return').dispatchEvent('click')
      await page.locator('article form').dispatchEvent('submit')
      await expect(page).toHaveURL(/\/admin\/deals\?/)
      expect(writes(fixture)).toHaveLength(1)
      fixture.scope.resolve()
      await expect(page.getByRole('article')).toHaveAttribute('aria-busy', 'false')
      await expect(note(page)).toHaveValue('')
      await expect(confirmed(page)).not.toBeChecked()
      await expect(page.getByTestId('save-operation')).toBeDisabled()
      expect(writes(fixture)[0]).toMatchObject({
        method: 'PATCH',
        path: `/api/admin/deals/${id}/scope`,
        body: {
          expectedContentVersion: 7,
          expectedOperationVersion: 0,
          note: 'Reviewed complete two-outlet scope',
          applicability: 'SELECTED_OUTLETS',
          merchantId,
          venueIds: [venue.id, secondVenue.id],
        },
      })
      await page.getByRole('tab', { name: 'Evidence', exact: true }).click()
      await expect(
        page.getByRole('link', { name: 'Open original source ↗', exact: true }),
      ).toHaveAttribute('href', sourceUrl)
      await page.getByLabel('Supporting URL or source reference', { exact: true }).fill(sourceUrl)
      await page
        .getByLabel('What did the source confirm?', { exact: true })
        .fill('Synthetic source explicitly confirms the complete two-outlet scope.')
      await page
        .getByRole('combobox', { name: 'Reviewed source snapshot', exact: true })
        .selectOption(citationId)
      await page
        .getByLabel('I reviewed this supporting source and confirmed the complete stated scope.', {
          exact: true,
        })
        .check()
      await note(page).fill('Personally reviewed pinned complete scope')
      await confirmed(page).check()
      await page.getByTestId('save-operation').click()
      await expect.poll(() => writes(fixture).length).toBe(2)
      await expect(page.getByRole('article')).toHaveAttribute('aria-busy', 'false')
      await expect(note(page)).toHaveValue('')
      await expect(confirmed(page)).not.toBeChecked()
      expect(fixture.state.current.reviewStatus).toBe('PENDING')
      expect(fixture.state.current.publication).toBe('UNPUBLISHED')
      expect(writes(fixture)[1]).toMatchObject({
        path: `/api/admin/deals/${id}/scope-evidence`,
        body: {
          expectedContentVersion: 8,
          expectedOperationVersion: 1,
          note: 'Personally reviewed pinned complete scope',
          reference: sourceUrl,
          statement: 'Synthetic source explicitly confirms the complete two-outlet scope.',
          staffConfirmed: true,
          citationId,
          sourceContentHash: sourceHash,
        },
      })
      await page.getByRole('tab', { name: 'Review', exact: true }).click()
      await expect(page.getByTestId('save-operation')).toBeDisabled()
      await note(page).fill('Independent complete-scope review')
      await confirmed(page).check()
      await page.getByTestId('save-operation').click()
      await expect.poll(() => fixture.state.current.reviewStatus).toBe('APPROVED')
      await expect(page.getByRole('article')).toHaveAttribute('aria-busy', 'false')
      expect(writes(fixture)[2]).toMatchObject({
        path: `/api/admin/deals/${id}/review`,
        body: {
          expectedContentVersion: 8,
          expectedOperationVersion: 2,
          note: 'Independent complete-scope review',
          decision: 'APPROVE',
        },
      })
      await expect(note(page)).toHaveValue('')
      await expect(confirmed(page)).not.toBeChecked()
      await snapshot(page, info, `review-result-${width}`)
      await page.getByRole('link', { name: 'Back to previous task', exact: false }).click()
      await expect(page).toHaveURL(returnTo)
      await expect(
        page.getByText('The linked imported deal is no longer on this page.', { exact: false }),
      ).toBeVisible()
      expect(writes(fixture)).toHaveLength(3)
      expect(
        fixture.calls.filter((call) =>
          /\/ingestion\/drafts\/[^/]+\/(?:outlet|review)$/u.test(call.path),
        ),
      ).toEqual([])
    } finally {
      fixture.scope.resolve()
      await receipt(info, fixture)
    }
  })
}
for (const outcome of ['CONFLICT', 'INTERNAL_SERVER_ERROR', 'FORBIDDEN'] as const) {
  test(`SYNTHETIC canonical scope ${outcome} cannot replay prior consent`, async ({
    page,
  }, info) => {
    const fixture = await boundary(page)
    try {
      fixture.state.failure = outcome
      await open(page)
      await chooseCompleteScope(page)
      await page.getByTestId('save-operation').click()
      await expect.poll(() => writes(fixture).length).toBe(1)
      fixture.scope.resolve()
      if (outcome === 'FORBIDDEN') {
        await expect(page.getByRole('alert')).toContainText(
          'Current administrator access is required.',
        )
        await expect(page.getByRole('article')).toHaveCount(0)
        await expect(note(page)).toHaveCount(0)
      } else {
        await expect(
          page.getByRole('status').filter({ hasText: 'outcome is unknown' }),
        ).toBeVisible()
        await page.getByTestId('refresh-deal').click()
        await expect(note(page)).toHaveValue('')
        await expect(confirmed(page)).not.toBeChecked()
        await expect(note(page)).toBeDisabled()
        await expect(confirmed(page)).toBeDisabled()
        await expect(page.getByTestId('save-operation')).toBeDisabled()
        await page.locator('article form').dispatchEvent('submit')
        expect(writes(fixture)).toHaveLength(1)
        fixture.state.current = { ...fixture.state.current, operationVersion: 1 }
        await page.getByTestId('refresh-deal').click()
        await expect(note(page)).toHaveValue('')
        await expect(confirmed(page)).not.toBeChecked()
      }
      expect(writes(fixture)).toHaveLength(1)
    } finally {
      fixture.scope.resolve()
      await receipt(info, fixture)
    }
  })
}
