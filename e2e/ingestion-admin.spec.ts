import type { AdminDealDetail, AdminDealSummary } from '@broke-oclock/contracts/admin-deals'
import type {
  IngestionDashboardResponse,
  IngestionDraft,
  IngestionDraftsResponse,
  IngestionRunsResponse,
} from '@broke-oclock/contracts/ingestion'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only helper; no E2E alias exists in this repository.
import { openAdminAccount } from './admin-ui'

// Synthetic native/HTTP boundaries exercise the original SPA, typed REST client and CSS.
// They do not establish live provider, database or source permission acceptance.
const firstId = '111111111111111111111111'
const secondId = '222222222222222222222222'
const canonicalDeal = (draft: IngestionDraft): AdminDealDetail => ({
  id: draft.id,
  title: draft.title,
  origin: 'IMPORTED',
  reviewStatus:
    draft.reviewStatus === 'APPROVED'
      ? 'APPROVED'
      : draft.reviewStatus === 'REJECTED'
        ? 'REJECTED'
        : 'PENDING',
  contentVersion: draft.contentVersion,
  operationVersion: draft.operationVersion ?? 0,
  merchantId: draft.merchantId,
  deletedAt: null,
  publishedAt: null,
  validFrom: draft.validFrom,
  validUntil: draft.validUntil,
  publication: 'UNPUBLISHED',
  description: draft.description,
  terms: draft.terms,
  category: draft.category,
  cuisine: null,
  offerType: 'OTHER',
  priceMinor: null,
  currency: 'SGD',
  discountPercent: null,
  rawValidityText: draft.rawValidityText,
  applicability: 'NO_FIXED_LOCATION',
  submittedById: null,
  reviewedById: null,
  reviewedVersion: null,
  reviewedAt: null,
  reviewNote: draft.reviewNote,
  sources: [],
  images: [],
  outlets: [],
  outletCount: 0,
  selectedVenueIds: [],
  nextOutletCursor: null,
  scopeEditable: true,
  scopeConfirmed: false,
  blockers: ['Validity needs clarification'],
  approvalReady: false,
  publicationReady: false,
  scopeEvidenceLabel: null,
})
const summary = (row: AdminDealDetail): AdminDealSummary => {
  const {
    id,
    title,
    origin,
    reviewStatus,
    contentVersion,
    operationVersion,
    merchantId,
    deletedAt,
    publishedAt,
    validFrom,
    validUntil,
    publication,
  } = row
  return {
    id,
    title,
    origin,
    reviewStatus,
    contentVersion,
    operationVersion,
    merchantId,
    deletedAt,
    publishedAt,
    validFrom,
    validUntil,
    publication,
  }
}
const installSyntheticBoundary = async (page: Page) => {
  const state: {
    native: boolean
    signOutUnknown: boolean
    access: 'UNAUTHORIZED' | 'FORBIDDEN' | ''
    dashboard: IngestionDashboardResponse
    drafts: IngestionDraft[]
    runs: IngestionRunsResponse['items']
    draftNextCursor: string | null
    draftPages: Map<string, IngestionDraftsResponse>
    queueGates: Map<string, Promise<void>>
    requests: { path: string; input: unknown; method: string }[]
    failures: Map<string, string>
    runGate: Promise<void> | undefined
  } = {
    native: true,
    signOutUnknown: false,
    access: '',
    dashboard: {
      source: {
        name: 'Synthetic source fixture',
        enabled: false,
        reuseApproved: false,
        onemapConfigured: true,
      },
      counts: { pending: 1, approved: 0, rejected: 0, failed: 0 },
    },
    drafts: [
      {
        id: firstId,
        title: '<img src=x onerror=alert(1)> Synthetic draft',
        description: '<script>unsafe()</script>',
        terms: 'Synthetic fixture terms',
        category: 'FOOD',
        offerType: 'OTHER',
        validFrom: null,
        validUntil: null,
        rawValidityText: 'While stocks last',
        applicability: 'NO_FIXED_LOCATION',
        merchantId: null,
        outlet: null,
        reviewStatus: 'PENDING',
        contentVersion: 7,
        operationVersion: 0,
        sourceUrl: 'https://example.test/source/1',
        sourceName: 'Synthetic source fixture',
        reviewNote: null,
        reviewReady: true,
      },
    ],
    runs: [
      {
        id: 'prior-run',
        sourceName: 'Synthetic prior source',
        status: 'COMPLETED',
        startedAt: '2026-01-01T00:00:00Z',
        finishedAt: '2026-01-01T00:01:00Z',
        fetchedCount: 5,
        createdCount: 2,
        updatedCount: 1,
        failedCount: 0,
        errorCode: null,
      },
    ],
    draftNextCursor: null,
    draftPages: new Map(),
    queueGates: new Map(),
    requests: [],
    failures: new Map(),
    runGate: undefined,
  }
  await page.route('**/api/auth/get-session**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        state.native
          ? {
              user: {
                id: 'a'.repeat(24),
                name: 'Synthetic operator',
                email: 'operator@example.test',
                role: 'USER',
              },
              session: {
                id: 'synthetic-session',
                userId: 'a'.repeat(24),
                expiresAt: '2099-01-01T00:00:00Z',
              },
            }
          : null,
      ),
    }),
  )
  await page.route('**/api/auth-methods', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        password: true,
        google: false,
        emailOtp: false,
        passwordRecovery: false,
      }),
    }),
  )
  await page.route('**/api/auth/sign-out', (route) => {
    if (state.signOutUnknown)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Synthetic unknown sign-out' }),
      })
    state.native = false
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })
  await page.route('**/api/admin/deals**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    state.requests.push({
      path: 'adminDeals.read',
      method: request.method(),
      input: { pathname: url.pathname },
    })
    expect(request.method()).toBe('GET')
    const records = [
      ...new Map(
        [...state.drafts, ...[...state.draftPages.values()].flatMap((page) => page.items)].map(
          (draft) => [draft.id, canonicalDeal(draft)],
        ),
      ).values(),
    ]
    const detail = records.find((row) => url.pathname === `/api/admin/deals/${row.id}`)
    await route.fulfill({
      contentType: 'application/json',
      status: url.pathname === '/api/admin/deals' || detail ? 200 : 404,
      body: JSON.stringify(
        url.pathname === '/api/admin/deals'
          ? { items: records.map(summary), nextCursor: null }
          : (detail ?? { error: { code: 'NOT_FOUND', message: 'Synthetic missing deal' } }),
      ),
    })
  })
  await page.route('**/api/ingestion/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method()
    const query: Record<string, unknown> = Object.fromEntries(url.searchParams.entries())
    if (query.limit) query.limit = Number(query.limit)
    const path =
      url.pathname === '/api/ingestion/dashboard'
        ? 'ingestion.dashboard'
        : url.pathname === '/api/ingestion/runs'
          ? method === 'POST'
            ? 'ingestion.run'
            : 'ingestion.runs'
          : url.pathname === '/api/ingestion/drafts'
            ? 'ingestion.queue'
            : url.pathname === '/api/ingestion/locations'
              ? 'ingestion.searchLocations'
              : url.pathname === '/api/ingestion/accounts'
                ? 'ingestion.accounts'
                : 'ingestion.supportingRead'
    state.requests.push({ path, method, input: query })
    const fail = state.failures.get(path)
    if (fail) state.failures.delete(path)
    const code = fail || state.access
    if (path === 'ingestion.queue') await state.queueGates.get(String(query.status))
    if (code) {
      await route.fulfill({
        status: code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code, message: 'Synthetic boundary failure' } }),
      })
      return
    }
    let data: unknown
    if (path === 'ingestion.dashboard') data = state.dashboard
    else if (path === 'ingestion.runs') data = { items: state.runs }
    else if (path === 'ingestion.queue') {
      const status = typeof query.status === 'string' ? query.status : 'PENDING'
      data = (typeof query.cursor === 'string'
        ? state.draftPages.get(query.cursor)
        : undefined) ?? {
        items: state.drafts.filter((draft) => draft.reviewStatus === status),
        nextCursor: state.draftNextCursor,
      }
    } else if (path === 'ingestion.run') {
      await state.runGate
      data = {
        runId: 'synthetic-run',
        status: 'COMPLETED',
        fetchedCount: 1,
        createdCount: 1,
        updatedCount: 0,
        failedCount: 0,
      }
    } else if (path === 'ingestion.searchLocations')
      data = {
        items: [
          {
            searchValue: 'Synthetic plaza',
            address: '123 FIXTURE ROAD',
            postalCode: '123456',
            latitude: 1.3,
            longitude: 103.8,
          },
        ],
      }
    else data = { items: [], nextCursor: null }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  return state
}
const requestsFor = (fixture: Awaited<ReturnType<typeof installSyntheticBoundary>>, path: string) =>
  fixture.requests.filter((request) => request.path === path)

test('admin deep link reaches anonymous sign-in while public navigation hides administration', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.access = 'UNAUTHORIZED'
  await page.route('**/api/deals?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], categories: [] }),
    }),
  )
  await page.route('**/api/account/bookmarks?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  )
  await page.goto('/browse')
  await page.getByTestId('nav-toggle').click()
  await expect(page.getByRole('link', { name: 'Ingestion admin', exact: true })).toHaveCount(0)
  await page.goto('/admin/ingestion')
  await expect(page.getByRole('heading', { name: 'Sign in to review ingestion' })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Imported deals', exact: true })).toHaveCount(0)
})

test('forbidden, dashboard failure and imported queue failure have distinct recovery paths', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.access = 'FORBIDDEN'
  await page.goto('/admin/ingestion')
  await expect(page.getByRole('alert')).toContainText('You do not have permission')
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  fixture.access = ''
  fixture.failures.set('ingestion.dashboard', 'INTERNAL_SERVER_ERROR')
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Unable to load ingestion')
  fixture.failures.set('ingestion.queue', 'INTERNAL_SERVER_ERROR')
  await page.getByRole('button', { name: 'Retry dashboard', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to load imported deals')
  await expect(page.getByText('0 imported deals loaded')).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry imported deals', exact: true }).click()
  await expect(page.getByTestId(`open-imported-${firstId}`)).toBeVisible()
})

for (const width of [320, 390, 1280]) {
  test(`readonly import triage fits ${width}px, escapes source text and hands off to Deals`, async ({
    page,
  }, info) => {
    const fixture = await installSyntheticBoundary(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/admin/ingestion')
    const queue = page.getByRole('region', { name: 'Imported deals', exact: true })
    await expect(queue).toContainText('<img src=x onerror=alert(1)> Synthetic draft')
    await expect(queue).toContainText('Validity needs clarification')
    await expect(queue.locator('img, script, textarea, input')).toHaveCount(0)
    await expect(queue.getByRole('button', { name: /approve|reject|save/i })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Sources & import', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run ingestion', exact: true })).toBeDisabled()
    await expect(page.getByText('Ingestion is disabled', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Operator reuse attestation is not recorded', { exact: true }),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Run history', exact: true }).click()
    const history = page.getByRole('tabpanel', { name: 'Run history', exact: true })
    await expect(history).toContainText('Synthetic prior source')
    await expect(history.getByRole('button', { name: 'Run ingestion', exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Imported deals', exact: true }).click()
    const link = page.getByTestId(`open-imported-${firstId}`)
    const target = new URL((await link.getAttribute('href')) ?? '', page.url())
    expect(target.pathname).toBe('/admin/deals')
    expect(target.searchParams.get('dealId')).toBe(firstId)
    expect(target.searchParams.get('tab')).toBe('content')
    const returnTo = target.searchParams.get('returnTo')
    expect(returnTo).toBe(`/admin/ingestion?status=PENDING&draftId=${firstId}#queue-title`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`ingestion-${width}.png`), fullPage: true })
    await link.focus()
    await link.press('Enter')
    await expect(page.getByRole('heading', { name: 'Deals operations', exact: true })).toBeVisible()
    await expect(page.locator('[name="edit-description"]')).toHaveValue('<script>unsafe()</script>')
    await expect(page.locator('.deals-directory script, .deals-directory img')).toHaveCount(0)
    await page.getByRole('link', { name: '← Back to previous task', exact: true }).click()
    await expect(page).toHaveURL(returnTo ?? '')
    await expect(page.getByTestId(`open-imported-${firstId}`)).toBeFocused()
    expect(fixture.requests.filter((request) => request.method !== 'GET')).toEqual([])
    expect(errors).toEqual([])
  })
}

test('pagination returns from Deals to the original bounded page and focused import', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  const original = fixture.drafts[0]
  if (!original) throw new Error('Missing synthetic import')
  fixture.draftNextCursor = secondId
  fixture.draftPages.set(secondId, {
    items: [{ ...original, id: '3'.repeat(24), title: 'Second-page imported meal' }],
    nextCursor: null,
  })
  await page.goto('/admin/ingestion')
  await page.getByRole('button', { name: 'Load more imported deals', exact: true }).click()
  const second = page.getByTestId(`open-imported-${'3'.repeat(24)}`)
  const target = new URL((await second.getAttribute('href')) ?? '', page.url())
  const back = target.searchParams.get('returnTo')
  expect(back).toBe(
    `/admin/ingestion?status=PENDING&draftId=${'3'.repeat(24)}&draftCursor=${secondId}#queue-title`,
  )
  await second.click()
  await expect(
    page.getByRole('heading', { name: 'Second-page imported meal', exact: true }),
  ).toBeVisible()
  const before = requestsFor(fixture, 'ingestion.queue').length
  await page.getByRole('link', { name: '← Back to previous task', exact: true }).click()
  await expect(second).toBeFocused()
  await expect(second).toHaveAttribute('aria-current', 'true')
  await expect(page.getByTestId(`open-imported-${firstId}`)).toHaveCount(0)
  expect(requestsFor(fixture, 'ingestion.queue')).toHaveLength(before + 1)
  expect(requestsFor(fixture, 'ingestion.queue').at(-1)?.input).toEqual({
    limit: 20,
    status: 'PENDING',
    cursor: secondId,
  })
  fixture.draftNextCursor = null
  await page.getByLabel('Review status', { exact: true }).selectOption('REJECTED')
  await expect(page.getByText('No imported deals match this status.')).toBeVisible()
  expect(new URL(page.url()).searchParams.has('draftCursor')).toBe(false)
  expect(new URL(page.url()).searchParams.has('draftId')).toBe(false)
  expect(fixture.requests.filter((request) => request.method !== 'GET')).toEqual([])
})

test('queue filter ignores an older denial and a current denial clears retained imports', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  await page.goto('/admin/ingestion')
  await expect(page.getByTestId(`open-imported-${firstId}`)).toBeVisible()
  let release = () => {}
  fixture.queueGates.set(
    'APPROVED',
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  fixture.failures.set('ingestion.queue', 'FORBIDDEN')
  await page.getByLabel('Review status', { exact: true }).selectOption('APPROVED')
  await expect
    .poll(() =>
      requestsFor(fixture, 'ingestion.queue').some(
        (request) => (request.input as { status?: string }).status === 'APPROVED',
      ),
    )
    .toBe(true)
  await page.getByLabel('Review status', { exact: true }).selectOption('REJECTED')
  await expect(page.getByText('No imported deals match this status.')).toBeVisible()
  release()
  await expect(page.getByRole('heading', { name: 'Imported deals', exact: true })).toBeVisible()
  fixture.failures.set('ingestion.queue', 'FORBIDDEN')
  await page.getByLabel('Review status', { exact: true }).selectOption('PENDING')
  await expect(page.getByRole('alert')).toContainText('You do not have permission')
  await expect(page.getByTestId(`open-imported-${firstId}`)).toHaveCount(0)
  await expect(page.locator('[aria-label="Ingestion counts"]')).toHaveCount(0)
})

test('Sources & import owns duplicate-protected execution while Run history stays historical', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.dashboard.source.enabled = true
  fixture.dashboard.source.reuseApproved = true
  let release = () => {}
  fixture.runGate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.goto('/admin/ingestion')
  await page.getByRole('tab', { name: 'Sources & import', exact: true }).click()
  await page.getByRole('button', { name: 'Run ingestion', exact: true }).click()
  const running = page.getByRole('button', { name: 'Running ingestion…', exact: true })
  await expect(running).toBeDisabled()
  await expect(page.getByRole('tab', { name: 'Imported deals', exact: true })).toBeDisabled()
  await running.dispatchEvent('click')
  await expect.poll(() => requestsFor(fixture, 'ingestion.run').length).toBe(1)
  release()
  await expect(
    page.getByRole('status').filter({ hasText: 'Run synthetic-run: COMPLETED' }),
  ).toBeVisible()
  for (const path of ['ingestion.dashboard', 'ingestion.runs', 'ingestion.queue'])
    await expect.poll(() => requestsFor(fixture, path).length).toBe(2)
  await page.getByRole('tab', { name: 'Run history', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: 'Run history', exact: true })).toContainText(
    'prior-run',
  )
  await expect(
    page
      .getByRole('tabpanel', { name: 'Run history', exact: true })
      .getByRole('button', { name: 'Run ingestion', exact: true }),
  ).toHaveCount(0)
})

test('location lookup remains read-only and account administration is absent from Ingestion', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  await page.goto('/admin/ingestion#locations-title')
  await page.getByLabel('Address, building or postal code').fill('fixture plaza')
  await page.getByLabel('Address, building or postal code').press('Enter')
  await expect(page.getByText('123 FIXTURE ROAD', { exact: false })).toBeVisible()
  await expect(page.getByText('Coordinates: 1.3, 103.8')).toBeVisible()
  await expect(page.getByText(/Candidates are not verified merchants or outlets/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Singapore Open Data Licence' })).toHaveAttribute(
    'href',
    'https://www.onemap.gov.sg/legal/opendatalicence.html',
  )
  expect(requestsFor(fixture, 'ingestion.searchLocations')[0]?.input).toEqual({
    query: 'fixture plaza',
  })
  await expect(
    page.getByRole('button', { name: 'View accounts (read-only)', exact: true }),
  ).toHaveCount(0)
  expect(requestsFor(fixture, 'ingestion.accounts')).toEqual([])
  expect(fixture.requests.filter((request) => request.method !== 'GET')).toEqual([])
})

test('unknown sign-out closes retained and late queue evidence without replaying work', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.signOutUnknown = true
  fixture.draftNextCursor = secondId
  await page.goto('/admin/ingestion')
  await expect(page.getByTestId(`open-imported-${firstId}`)).toBeVisible()
  let release = () => {}
  fixture.queueGates.set(
    'PENDING',
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  await page.getByRole('button', { name: 'Load more imported deals', exact: true }).click()
  await openAdminAccount(page)
  await page.getByTestId('admin-sign-out').click()
  await expect(page.getByText(/Server sign-out could not be confirmed/)).toBeVisible()
  release()
  await expect(page.getByTestId(`open-imported-${firstId}`)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Imported deals', exact: true })).toHaveCount(0)
  expect(requestsFor(fixture, 'ingestion.run')).toHaveLength(0)
  expect(fixture.requests.filter((request) => request.method !== 'GET')).toEqual([])
})

test('shared sign-in rechecks protected reads after a synthetic auth response', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.access = 'UNAUTHORIZED'
  let signIns = 0
  await page.route('**/api/auth/sign-in/email', async (route) => {
    signIns++
    fixture.access = ''
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'a'.repeat(24),
          name: 'Synthetic operator',
          email: 'operator@example.test',
          emailVerified: true,
          role: 'ADMIN',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      }),
    })
  })
  await page.goto('/admin/ingestion')
  await page.getByLabel('Email', { exact: true }).fill('operator@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-not-a-real-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Imported deals', exact: true })).toBeVisible()
  expect(signIns).toBe(1)
  expect(requestsFor(fixture, 'ingestion.dashboard')).toHaveLength(2)
  expect(
    await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
  ).toEqual({ local: {}, session: {} })
})
