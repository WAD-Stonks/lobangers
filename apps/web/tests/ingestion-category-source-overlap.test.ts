import type { IngestionDraft } from '@broke-oclock/contracts/ingestion'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { api } from '@web/lib/api-client'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import type { InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Original readonly import page and typed HTTP client; transport/native identity are synthetic.
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn(async () => ({
      data: {
        user: { id: 'synthetic-admin', role: 'ADMIN' },
        session: { id: 'synthetic-session', userId: 'synthetic-admin' },
      },
      error: null,
    })),
    useSession: () => ({ value: { refetch: async () => {}, error: null } }),
    signOut: vi.fn(async () => ({ error: null })),
    signIn: { email: vi.fn() },
  },
}))

const idA = '111111111111111111111111'
const idB = '222222222222222222222222'
const source = {
  id: '333333333333333333333333',
  name: 'Synthetic source',
  provider: 'TELEGRAM',
  externalId: 'synthetic',
  url: 'https://t.me/s/synthetic',
  enabled: false,
  updatedAt: '2026-10-20T00:00:00.000Z',
}
const draft = (id: string): IngestionDraft => ({
  id,
  title: `Synthetic private draft ${id}`,
  description: 'Synthetic evidence, not a real promotion',
  terms: null,
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: '2099-01-01T00:00:00Z',
  validUntil: '2099-12-01T00:00:00Z',
  rawValidityText: null,
  applicability: 'NO_FIXED_LOCATION',
  merchantId: null,
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 2,
  operationVersion: 1,
  sourceUrl: 'https://source.example.test/post',
  sourceName: source.name,
  reviewNote: null,
  reviewReady: true,
  images: [
    {
      sha256: 'a'.repeat(64),
      url: 'https://media.example.test/private.jpg',
      sourceUrl: 'https://source.example.test/photo',
      altText: 'Synthetic private image',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      status: 'HOSTED',
    },
  ],
})
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
let wrapper: VueWrapper | undefined
let rows: IngestionDraft[]
let calls: InternalAxiosRequestConfig[]
let writes: Map<string, ReturnType<typeof deferred>>
const originalAdapter = api.http.defaults.adapter
beforeEach(() => {
  rows = [draft(idA), draft(idB)]
  calls = []
  writes = new Map([
    [idA, deferred()],
    [idB, deferred()],
  ])
  api.http.defaults.adapter = async (config) => {
    calls.push(config)
    let data: unknown
    if (config.url === '/ingestion/dashboard')
      data = {
        source: {
          name: source.name,
          enabled: false,
          reuseApproved: false,
          onemapConfigured: false,
        },
        counts: { pending: rows.length, approved: 0, rejected: 0, failed: 0 },
      }
    else if (config.url === '/ingestion/drafts')
      data = { items: structuredClone(rows), nextCursor: null }
    else if (/^\/ingestion\/drafts\/[a-f0-9]{24}\/evidence$/u.test(config.url ?? ''))
      data = { items: [], nextCursor: null }
    else if (config.url === '/ingestion/runs') data = { items: [] }
    else if (config.url === '/auth-methods')
      data = { password: true, google: false, emailOtp: false, passwordRecovery: false }
    else if (config.url === '/ingestion/sources' && config.method === 'get')
      data = { items: [source], nextCursor: null }
    else if (config.url === '/ingestion/sources' && config.method === 'post') data = source
    else if (config.url === `/ingestion/sources/${source.id}` && config.method === 'patch')
      data = { ...source, enabled: true, updatedAt: '2026-10-20T00:00:01.000Z' }
    else {
      const id = [idA, idB].find((value) => config.url === `/ingestion/drafts/${value}/category`)
      const gate = id && writes.get(id)
      if (!gate || config.method !== 'patch')
        throw new Error(`Unexpected synthetic request ${config.method} ${config.url}`)
      data = await gate.promise
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
})
afterEach(async () => {
  wrapper?.unmount()
  for (const [id, gate] of writes)
    gate.resolve({
      id,
      contentVersion: 3,
      operationVersion: 2,
      category: 'DRINKS',
      reviewStatus: 'PENDING',
    })
  await flushPromises()
  api.http.defaults.adapter = originalAdapter
  wrapper = undefined
})
const requests = (url: string) => calls.filter((call) => call.url === url)
const open = async () => {
  wrapper = mount(IngestionAdminPage)
  await flushPromises()
  return wrapper
}
const changeSource = async (page: VueWrapper, operation: 'add' | 'toggle') => {
  const panel = page.get('section[aria-labelledby="sources-title"]')
  if (operation === 'add') {
    expect(panel.get('[data-testid="add-source"]').attributes('disabled')).toBeUndefined()
    await panel.get('#source-name').setValue('Synthetic added source')
    await panel.get('#source-preview-url').setValue(source.url)
    await panel.get('form').trigger('submit')
  } else {
    await panel.get('[data-testid="load-sources"]').trigger('click')
    await flushPromises()
    await panel.get('input[type="checkbox"]').setValue(true)
    await panel.get('[data-testid="toggle-source"]').trigger('click')
  }
  await flushPromises()
  expect(requests('/ingestion/dashboard')).toHaveLength(2)
}
it.each(['add', 'toggle'] as const)(
  'source %s refreshes readonly imports without category or review side effects',
  async (operation) => {
    const page = await open()
    expect(page.findAll('[data-testid^="open-imported-"]')).toHaveLength(2)
    await page.get('#ingestion-workspace-tab-settings').trigger('click')
    await changeSource(page, operation)
    expect(requests('/ingestion/drafts')).toHaveLength(2)
    expect(
      calls.filter((call) => call.url?.match(/\/drafts\/.*\/(category|review|outlet)$/u)),
    ).toHaveLength(0)
    await page.get('#ingestion-workspace-tab-drafts').trigger('click')
    expect(page.find('[data-testid="category-form"]').exists()).toBe(false)
    expect(page.find('[data-testid="approve-draft"]').exists()).toBe(false)
    const link = new URL(
      page.get(`[data-testid="open-imported-${idA}"]`).attributes('href') ?? '',
      'http://localhost',
    )
    expect(link.pathname).toBe('/admin/deals')
    expect(link.searchParams.get('dealId')).toBe(idA)
    expect(link.searchParams.get('tab')).toBe('content')
  },
)

it('sign-out closes the readonly queue and removes imported image evidence', async () => {
  const page = await open()
  await page.get('details.imported-deal-images summary').trigger('click')
  expect(page.findAll('img').length).toBeGreaterThan(0)
  await page.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(page.find('section[aria-labelledby="queue-title"]').exists()).toBe(false)
  expect(page.find('img').exists()).toBe(false)
  expect(page.html()).not.toContain('media.example.test/private.jpg')
  expect(page.text()).not.toContain(draft(idA).title)
  expect(requests('/ingestion/dashboard')).toHaveLength(1)
})
