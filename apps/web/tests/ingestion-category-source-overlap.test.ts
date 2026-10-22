import type { IngestionDraft } from '@broke-oclock/contracts/ingestion'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { api } from '@web/lib/api-client'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import type { InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Original mounted page and typed HTTP client; only transport/native identity are synthetic.
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn(async () => ({
      data: { user: { id: 'synthetic-admin', role: 'ADMIN' } },
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
    gate.resolve({ id, contentVersion: 3, category: 'DRINKS', reviewStatus: 'PENDING' })
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
const select = async (page: VueWrapper, id: string) =>
  page.get(`[data-testid="view-${id}"]`).trigger('click')
const startCategory = async (page: VueWrapper, id: string) => {
  await select(page, id)
  await page.get('#draft-category').setValue('DRINKS')
  await page.get('[data-testid="category-form"]').trigger('submit')
  await flushPromises()
  expect(requests(`/ingestion/drafts/${id}/category`)).toHaveLength(1)
  expect(JSON.parse(requests(`/ingestion/drafts/${id}/category`)[0]?.data)).toEqual({
    expectedContentVersion: 2,
    category: 'DRINKS',
  })
  expect(page.get('[data-testid="save-category"]').text()).toBe('Saving…')
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
const finishCategory = async (id: string) => {
  writes.get(id)?.resolve({ id, contentVersion: 3, category: 'DRINKS', reviewStatus: 'PENDING' })
  await flushPromises()
}

it.each(['add', 'toggle'] as const)(
  'recovers category pending after source %s refresh without accepting stale completion or in-flight read as fresh evidence',
  async (operation) => {
    const page = await open()
    await startCategory(page, idA)
    await changeSource(page, operation)
    expect(page.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
    await page.get('[data-testid="reload-draft"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="reload-draft"]').exists()).toBe(true)
    await finishCategory(idA)
    expect(page.get('[data-testid="reload-draft"]').attributes('disabled')).toBeUndefined()
    // Revision and explicit in-flight read both ran, but neither could unlock active A.
    expect(requests('/ingestion/drafts')).toHaveLength(3)
    expect(page.get('article').text()).toContain('FOOD / OTHER')
    expect(page.get('article').text()).toContain('Version 2')
    expect(page.text()).not.toContain('Category updated.')
    expect(requests('/ingestion/dashboard')).toHaveLength(2)
    expect(requests(`/ingestion/drafts/${idA}/category`)).toHaveLength(1)
    // A post-completion but old-version response cannot unlock the identity either.
    await page.get('[data-testid="reload-draft"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="reload-draft"]').exists()).toBe(true)
    rows = [{ ...draft(idA), contentVersion: 3, category: 'DRINKS' }, draft(idB)]
    await page.get('[data-testid="reload-draft"]').trigger('click')
    await flushPromises()
    expect(page.find('[data-testid="reload-draft"]').exists()).toBe(false)
    expect(page.get('article').text()).toContain('DRINKS / OTHER')
    expect(page.get('#review-note').element).toHaveProperty('value', '')
    await page.get('#review-note').setValue('Freshly reviewed version three')
    expect(page.get('[data-testid="reject-draft"]').attributes('disabled')).toBeUndefined()
  },
)

it('late category A completion cannot clear category B pending or its identity lock after a source revision', async () => {
  const page = await open()
  await startCategory(page, idA)
  await changeSource(page, 'add')
  await startCategory(page, idB)
  await finishCategory(idA)
  expect(page.get('#draft-title').text()).toBe(draft(idB).title)
  expect(page.get('article').text()).toContain('FOOD / OTHER')
  expect(page.get('[data-testid="category-form"]').attributes('aria-busy')).toBe('true')
  expect(page.get('[data-testid="save-category"]').text()).toBe('Saving…')
  expect(page.get('#queue-status').attributes('disabled')).toBeDefined()
  expect(page.get('[data-testid="reload-draft"]').attributes('disabled')).toBeDefined()
  expect(requests('/ingestion/dashboard')).toHaveLength(2)
  await finishCategory(idB)
  expect(page.get('[data-testid="category-form"]').attributes('aria-busy')).toBe('false')
  expect(page.get('#queue-status').attributes('disabled')).toBeUndefined()
  await select(page, idA)
  expect(page.find('[data-testid="reload-draft"]').exists()).toBe(true)
  await page.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  expect(page.find('[data-testid="reload-draft"]').exists()).toBe(true)
  rows = [{ ...draft(idA), contentVersion: 3, category: 'DRINKS' }, draft(idB)]
  await page.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  expect(page.find('[data-testid="reload-draft"]').exists()).toBe(false)
  expect(requests(`/ingestion/drafts/${idA}/category`)).toHaveLength(1)
  expect(requests(`/ingestion/drafts/${idB}/category`)).toHaveLength(1)
})

it('sign-out while category is pending clears private images and selection and fences late completion', async () => {
  const page = await open()
  await select(page, idA)
  await page.get('#review-note').setValue('Private pending review note')
  expect(page.findAll('img')).toHaveLength(1)
  await page.get('#draft-category').setValue('DRINKS')
  await page.get('[data-testid="category-form"]').trigger('submit')
  await flushPromises()
  expect(requests(`/ingestion/drafts/${idA}/category`)).toHaveLength(1)
  expect(page.get('#review-note').element).toHaveProperty('value', 'Private pending review note')
  await page.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(page.find('section[aria-labelledby="queue-title"]').exists()).toBe(false)
  expect(page.find('img').exists()).toBe(false)
  await finishCategory(idA)
  expect(page.find('article').exists()).toBe(false)
  expect(page.find('img').exists()).toBe(false)
  expect(page.html()).not.toContain('media.example.test/private.jpg')
  expect(page.text()).not.toContain(draft(idA).title)
  expect(page.html()).not.toContain('Private pending review note')
  expect(page.text()).not.toContain('Category updated.')
  expect(requests('/ingestion/dashboard')).toHaveLength(1)
})
