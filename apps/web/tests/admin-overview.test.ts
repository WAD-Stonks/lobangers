import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import { ApiClientError } from '@web/lib/api-client'
import routes from '@web/router/routes'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic REST/native boundaries: SPA projection and races, not live authentication.
// The overview never mounts the landing page; avoid its unrelated Windows public-asset transform.
vi.mock('@web/pages/LandingPage.vue', () => ({ default: { template: '<div />' } }))
const rest = vi.hoisted(() => ({
  overview: vi.fn(),
  analytics: vi.fn(),
  activity: vi.fn(),
  session: vi.fn(),
  signOut: vi.fn(),
  methods: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: {
    adminAudit: { list: rest.activity },
    platformAdmin: { overview: rest.overview, userAnalytics: rest.analytics },
    infrastructure: { authMethods: rest.methods },
  },
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ value: { refetch: async () => {}, error: null } }),
    getSession: rest.session,
    signOut: rest.signOut,
  },
}))
const overview = {
  generatedAt: '2026-10-10T00:00:00Z',
  counts: { pendingMerchantRequests: 3, pendingImportedDrafts: 5, failedImportedPosts: 7 },
  recentRuns: [],
  readiness: {
    googleConfigured: false,
    emailConfigured: false,
    oneMapConfigured: true,
    ingestionOptIn: false,
    reuseAttested: false,
    sourceRecordEnabled: false,
    sourceIdentityValid: true,
    importAllowed: false,
    liveProviderAcceptance: 'NOT_ESTABLISHED',
  },
}
beforeEach(() => {
  vi.resetAllMocks()
  rest.analytics.mockRejectedValue(new Error('Synthetic analytics unavailable'))
  rest.activity.mockResolvedValue({ items: [], nextCursor: null })
  rest.overview.mockResolvedValue(overview)
  rest.session.mockResolvedValue({
    data: {
      user: {
        id: 'synthetic-admin',
        name: 'Synthetic operator',
        email: 'operator@example.test',
        role: 'USER',
      },
      session: { id: 'synthetic-session', userId: 'synthetic-admin' },
    },
    error: null,
  })
  rest.signOut.mockResolvedValue({ data: { success: true }, error: null })
  rest.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: false,
    passwordRecovery: false,
  })
})
async function open() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/admin')
  const w = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return w
}
it('renders protected operational counts and exact actionable links without live-readiness claims', async () => {
  const w = await open()
  expect(w.get('h1').text()).toBe('Admin overview')
  expect(w.findAll('.admin-overview-panels h2').map((heading) => heading.attributes('id'))).toEqual(
    [
      'work-title',
      'registration-title',
      'attention-title',
      'quick-actions-title',
      'import-chart-title',
      'overview-runs-title',
      'recent-activity-title',
      'readiness-title',
    ],
  )
  expect(
    w.get('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').text(),
  ).toContain('3')
  expect(w.get('a[href="/admin/ingestion?status=PENDING#queue-title"]').text()).toContain('5')
  expect(w.find('a[href="/admin/ingestion#runs-title"]').exists()).toBe(true)
  expect(w.text()).toContain('Failed imported posts: 7')
  expect(w.text()).toContain('NOT_ESTABLISHED')
  expect(w.text()).toContain('not publisher permission')
  expect(w.text()).toContain('No ingestion runs yet')
  w.unmount()
})
it('shows sign-in on confirmed absent native identity without a protected read', async () => {
  rest.session.mockResolvedValue({ data: null, error: null })
  const w = await open()
  expect(w.text()).toContain('Sign in to view administration')
  expect(rest.overview).not.toHaveBeenCalled()
  expect(rest.activity).not.toHaveBeenCalled()
  w.unmount()
})
it('keeps the overview available when activity fails and clears it when audit access is denied', async () => {
  rest.activity.mockRejectedValueOnce(new Error('private audit diagnostic'))
  const w = await open()
  expect(w.find('.overview-summary').exists()).toBe(true)
  expect(w.text()).toContain('Recent activity is unavailable')
  expect(w.text()).not.toContain('private audit diagnostic')
  rest.activity.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await w.get('[data-testid="refresh-admin-activity"]').trigger('click')
  await flushPromises()
  expect(w.text()).toContain('You do not have permission')
  expect(w.find('.overview-summary').exists()).toBe(false)
  expect(w.find('.recent-admin-activity').exists()).toBe(false)
  w.unmount()
})
it('shows only nonempty attention queues and links quick actions to existing admin destinations', async () => {
  rest.overview.mockResolvedValueOnce({
    ...overview,
    counts: { pendingMerchantRequests: 0, pendingImportedDrafts: 5, failedImportedPosts: 0 },
  })
  const w = await open()
  const attention = w.get('.overview-attention')
  expect(attention.findAll('li')).toHaveLength(1)
  expect(attention.get('a').attributes('href')).toBe('/admin/ingestion?status=PENDING#queue-title')
  expect(attention.text()).toContain('5 Imported drafts await review')
  expect(
    w
      .get('.overview-shortcuts')
      .findAll('a')
      .map((link) => link.attributes('href')),
  ).toEqual(['/admin/deals', '/admin/accounts', '/admin/moderation'])
  expect(w.get('.overview-import-chart').text()).toContain(
    'Import results will appear here after a run is recorded',
  )
  expect(w.find('[data-testid="import-chart-metric"]').exists()).toBe(false)
  rest.overview.mockResolvedValueOnce({
    ...overview,
    counts: { pendingMerchantRequests: 0, pendingImportedDrafts: 0, failedImportedPosts: 0 },
  })
  await w.get('[data-testid="overview-refresh"]').trigger('click')
  await flushPromises()
  expect(w.get('.overview-attention').findAll('li')).toHaveLength(0)
  expect(w.get('.overview-attention').text()).toContain(
    'No pending merchant requests, imported drafts or failed imported posts in this snapshot',
  )
  w.unmount()
})
it('compares recent runs on one shared scale and filters series without fetching more data', async () => {
  const run = {
    id: 'run-a',
    sourceName: 'Source A',
    status: 'PARTIAL',
    startedAt: '2026-10-31T04:30:00Z',
    finishedAt: null,
    fetchedCount: 7,
    createdCount: 4,
    updatedCount: 2,
    failedCount: 1,
    errorCode: null,
  }
  rest.overview.mockResolvedValueOnce({
    ...overview,
    recentRuns: [
      run,
      {
        ...run,
        id: 'run-b',
        sourceName: 'Source B',
        createdCount: 8,
        updatedCount: 0,
        failedCount: 0,
      },
    ],
  })
  const w = await open()
  const chart = w.get('.overview-import-chart')
  expect(chart.findAll('.overview-chart-run')).toHaveLength(2)
  expect(chart.text()).toContain('Each full-width bar represents 8 posts')
  expect(
    chart.findAll('[data-series="created"].overview-chart-bar')[0]?.attributes('style'),
  ).toContain('width: 50%')
  expect(
    chart.findAll('[data-series="created"].overview-chart-bar')[1]?.attributes('style'),
  ).toContain('width: 100%')
  await w.get('[data-testid="import-chart-metric"]').setValue('failedCount')
  expect(chart.findAll('.overview-chart-bar')).toHaveLength(2)
  expect(chart.find('[data-series="created"]').exists()).toBe(false)
  expect(chart.findAll('.overview-chart-bar')[0]?.attributes('style')).toContain('width: 100%')
  expect(chart.findAll('.overview-chart-bar')[1]?.attributes('style')).toContain('width: 0%')
  expect(rest.overview).toHaveBeenCalledTimes(1)
  w.unmount()
})
it('renders zero-result runs with zero-length bars and clears every new panel on access loss', async () => {
  const run = {
    id: 'empty-run',
    sourceName: 'Empty source',
    status: 'SUCCEEDED',
    startedAt: '2026-10-31T04:30:00Z',
    finishedAt: '2026-10-31T04:31:00Z',
    fetchedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    failedCount: 0,
    errorCode: null,
  }
  rest.overview.mockResolvedValueOnce({ ...overview, recentRuns: [run] })
  const w = await open()
  for (const bar of w.findAll('.overview-chart-bar'))
    expect(bar.attributes('style')).toContain('width: 0%')
  rest.overview.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await w.get('[data-testid="overview-refresh"]').trigger('click')
  await flushPromises()
  expect(w.find('.overview-import-chart').exists()).toBe(false)
  expect(w.find('.overview-attention').exists()).toBe(false)
  expect(w.find('.overview-shortcuts').exists()).toBe(false)
  w.unmount()
})
it('refreshes through a fresh identity check, disables duplicate refresh and replaces the snapshot', async () => {
  const w = await open()
  let release!: (value: typeof overview) => void
  rest.overview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const previousSessionReads = rest.session.mock.calls.length
  await w.get('[data-testid="overview-refresh"]').trigger('click')
  await flushPromises()
  expect(rest.session.mock.calls.length).toBeGreaterThan(previousSessionReads)
  expect(w.get('[data-testid="overview-refresh"]').attributes('disabled')).toBeDefined()
  expect(w.find('.overview-summary').exists()).toBe(false)
  release({
    ...overview,
    generatedAt: '2026-10-31T04:30:00Z',
    counts: { ...overview.counts, pendingMerchantRequests: 9 },
  })
  await flushPromises()
  expect(rest.overview).toHaveBeenCalledTimes(2)
  expect(w.get('[data-testid="overview-refresh"]').attributes('disabled')).toBeUndefined()
  expect(w.get('.overview-toolbar time').attributes('datetime')).toBe('2026-10-31T04:30:00Z')
  expect(w.get('.overview-summary a').text()).toContain('9')
  w.unmount()
})
it('clears protected overview data when refresh discovers that admin access was removed', async () => {
  const w = await open()
  rest.overview.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await w.get('[data-testid="overview-refresh"]').trigger('click')
  await flushPromises()
  expect(w.text()).toContain('You do not have permission')
  expect(w.find('.overview-summary').exists()).toBe(false)
  expect(w.find('[data-testid="overview-refresh"]').exists()).toBe(false)
  w.unmount()
})
it('renders run results, unfinished timestamps and escaped error details in the recent-imports table', async () => {
  const run = {
    id: 'synthetic-run',
    sourceName: 'Synthetic source',
    status: 'FAILED',
    startedAt: '2026-10-31T04:30:00Z',
    finishedAt: null,
    fetchedCount: 10,
    createdCount: 3,
    updatedCount: 2,
    failedCount: 5,
    errorCode: '<script>private()</script>',
  }
  rest.overview.mockResolvedValueOnce({ ...overview, recentRuns: [run] })
  const w = await open()
  const row = w.get('.overview-runs-table tbody tr')
  expect(row.text()).toContain('Synthetic source')
  expect(row.text()).toContain('Not finished')
  expect(row.text()).toContain('Fetched 10')
  expect(row.text()).toContain('Created 3 · Updated 2')
  expect(row.text()).toContain('Failed posts 5')
  expect(row.get('time').attributes('datetime')).toBe(run.startedAt)
  expect(row.get('.overview-status').attributes('data-tone')).toBe('danger')
  expect(row.text()).toContain(run.errorCode)
  expect(row.find('script').exists()).toBe(false)
  w.unmount()
})
it('keeps failed logout closed and fences an old overview read', async () => {
  let release!: (value: typeof overview) => void
  rest.overview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  rest.signOut.mockRejectedValueOnce(new Error('synthetic timeout'))
  const w = await open()
  await w.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  release(overview)
  await flushPromises()
  expect(w.text()).toContain('Server sign-out could not be confirmed')
  expect(w.find('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').exists()).toBe(
    false,
  )
  expect(w.find('input[type="password"]').exists()).toBe(false)
  w.unmount()
})

it('shows safe read errors without fallback zero counts and recovers only through a fresh read', async () => {
  rest.overview.mockRejectedValueOnce(new Error('private provider fixture'))
  const w = await open()
  expect(w.text()).toContain('Counts are unavailable')
  expect(w.text()).not.toContain('private provider fixture')
  expect(w.find('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').exists()).toBe(
    false,
  )
  await w.get('button.btn-outline-primary').trigger('click')
  await flushPromises()
  expect(rest.overview).toHaveBeenCalledTimes(2)
  expect(w.text()).toContain('Pending merchant requests: 3')
  w.unmount()
})
it('keeps native identity and logout visible in a protected forbidden state', async () => {
  rest.overview.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  const w = await open()
  expect(w.text()).toContain('You do not have permission')
  expect(w.text()).toContain('operator@example.test')
  expect(w.find('[data-testid="admin-sign-out"]').exists()).toBe(true)
  expect(w.find('input[type="password"]').exists()).toBe(false)
  w.unmount()
})
it('requires deliberate fresh-session and protected-read reload after an uncertain logout', async () => {
  rest.signOut.mockRejectedValueOnce(new Error('synthetic timeout'))
  const w = await open()
  await w.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(w.find('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').exists()).toBe(
    false,
  )
  const recheck = w.findAll('button').find((button) => button.text() === 'Recheck session')
  if (!recheck) throw new Error('Missing deliberate session recheck control')
  await recheck.trigger('click')
  await flushPromises()
  expect(rest.overview).toHaveBeenCalledTimes(1)
  expect(w.text()).toContain('Access remains closed')
  await w.get('[data-testid="admin-access-reload"]').trigger('click')
  await flushPromises()
  expect(rest.overview).toHaveBeenCalledTimes(2)
  expect(rest.session).toHaveBeenLastCalledWith({ query: { disableCookieCache: true } })
  expect(rest.signOut).toHaveBeenCalledTimes(1)
  w.unmount()
})
