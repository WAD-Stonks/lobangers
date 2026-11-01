import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { api } from '@web/lib/api-client'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Real Vue page, DOM and shared Axios client; network/native identity below are synthetic.
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
const source = {
  id: '0123456789abcdef01234567',
  name: 'ThisCounted fixture',
  provider: 'TELEGRAM' as const,
  externalId: 'thiscounted',
  url: 'https://t.me/s/ThisCounted',
  enabled: false,
  updatedAt: '2026-10-20T00:00:00.000Z',
}
const dashboard = {
  source: { name: 'MoneyDigest', enabled: false, reuseApproved: false, onemapConfigured: false },
  counts: { pending: 0, approved: 0, rejected: 0, failed: 0 },
}
let wrapper: VueWrapper | undefined
let rows = [source]
let handler: (config: InternalAxiosRequestConfig) => Promise<{ status: number; data: unknown }>
let calls: InternalAxiosRequestConfig[] = []
const response = (data: unknown, status = 200) => ({ data, status })
beforeEach(() => {
  rows = [{ ...source }]
  calls = []
  handler = async (config) => {
    if (config.url === '/ingestion/sources') {
      if (config.method === 'post') return response(source, 201)
      return response({ items: rows, nextCursor: null })
    }
    if (config.url === `/ingestion/sources/${source.id}`)
      return response({ ...source, enabled: true, updatedAt: '2026-10-20T00:00:01.000Z' })
    if (config.url === '/ingestion/dashboard') return response(dashboard)
    if (config.url === '/auth-methods')
      return response({ password: true, google: false, emailOtp: false, passwordRecovery: false })
    if (config.url === '/ingestion/drafts') return response({ items: [], nextCursor: null })
    if (config.url === '/ingestion/runs') return response({ items: [] })
    throw new Error(`Unexpected synthetic request ${config.url}`)
  }
  api.http.defaults.adapter = async (config) => {
    calls.push(config)
    const result = await handler(config)
    const value = { ...result, statusText: '', headers: {}, config }
    if (result.status >= 400)
      throw new AxiosError('Synthetic HTTP failure', 'ERR_BAD_RESPONSE', config, undefined, value)
    return value
  }
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
const open = async () => {
  wrapper = mount(IngestionAdminPage)
  await flushPromises()
  return wrapper
}
const panel = () => {
  if (!wrapper) throw new Error('Page not mounted')
  return wrapper.get('section[aria-labelledby="sources-title"]')
}

it('renders source configuration inside authorized admin page, with labelled fields and an empty state', async () => {
  rows = []
  const page = await open()
  expect(page.text()).toContain('Telegram sources')
  await panel().get('[data-testid="load-sources"]').trigger('click')
  await flushPromises()
  expect(panel().text()).toContain('No registered sources')
  expect(panel().find('label[for="source-name"]').text()).toBe('Source name')
  expect(panel().find('label[for="source-preview-url"]').text()).toBe('Telegram preview URL')
})

it('adds a disabled source through the typed client, validates literal URL, and prevents double submit while pending', async () => {
  await open()
  await panel().get('#source-name').setValue(' Fixture ')
  await panel().get('#source-preview-url').setValue('https://t.me:443/s/ThisCounted')
  await panel().get('form').trigger('submit')
  await flushPromises()
  expect(panel().text()).toContain('Use https://t.me/s/<publicusername>')
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0)
  let release: ((value: { status: number; data: unknown }) => void) | undefined
  const previous = handler
  handler = (config) =>
    config.url === '/ingestion/sources' && config.method === 'post'
      ? new Promise((resolve) => {
          release = resolve
        })
      : previous(config)
  await panel().get('#source-preview-url').setValue('https://t.me/s/ThisCounted')
  await panel().get('form').trigger('submit')
  await flushPromises()
  await panel().get('form').trigger('submit')
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(1)
  expect(panel().get('[data-testid="add-source"]').attributes('disabled')).toBeDefined()
  expect(JSON.parse(calls.find((c) => c.method === 'post')?.data)).toEqual({
    name: 'Fixture',
    previewUrl: 'https://t.me/s/ThisCounted',
  })
  release?.(response({ ...source, name: 'Fixture' }, 201))
  await flushPromises()
  expect(panel().text()).toContain('Added disabled source')
  expect(panel().get('a').attributes('href')).toBe(source.url)
  expect(panel().get('#source-preview-url').element).toHaveProperty('value', '')
})

it('requires explicit permission confirmation, prevents duplicate toggles and disables using the fresh returned timestamp', async () => {
  await open()
  await panel().get('[data-testid="load-sources"]').trigger('click')
  await flushPromises()
  const row = () => panel().get(`[data-source-id="${source.id}"]`)
  expect(row().text()).toContain('Disabled')
  expect(row().get('[data-testid="toggle-source"]').attributes('disabled')).toBeDefined()
  await row().get('input[type="checkbox"]').setValue(true)
  let release: ((value: { status: number; data: unknown }) => void) | undefined
  const previous = handler
  handler = (config) =>
    config.method === 'patch'
      ? new Promise((resolve) => {
          release = resolve
        })
      : previous(config)
  await row().get('[data-testid="toggle-source"]').trigger('click')
  await flushPromises()
  await row().get('[data-testid="toggle-source"]').trigger('click')
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
  expect(JSON.parse(calls.find((c) => c.method === 'patch')?.data)).toEqual({
    enabled: true,
    reuseConfirmed: true,
    expectedUpdatedAt: source.updatedAt,
  })
  const updatedAt = '2026-10-20T00:00:01.000Z'
  release?.(response({ ...source, enabled: true, updatedAt }))
  await flushPromises()
  expect(row().text()).toContain('Enabled')
  expect(row().find('input[type="checkbox"]').exists()).toBe(false)
  handler = (config) =>
    config.method === 'patch'
      ? Promise.resolve(response({ ...source, updatedAt: '2026-10-20T00:00:02.000Z' }))
      : previous(config)
  await row().get('[data-testid="toggle-source"]').trigger('click')
  await flushPromises()
  expect(JSON.parse(calls.filter((c) => c.method === 'patch')[1]?.data)).toEqual({
    enabled: false,
    reuseConfirmed: false,
    expectedUpdatedAt: updatedAt,
  })
  expect(row().get('input[type="checkbox"]').element).toHaveProperty('checked', false)
})

it('re-fetches authoritative source state after conflict without replaying the mutation or reusing confirmation', async () => {
  await open()
  await panel().get('[data-testid="load-sources"]').trigger('click')
  await flushPromises()
  await panel().get('input[type="checkbox"]').setValue(true)
  const previous = handler
  const fresh = { ...source, updatedAt: '2026-10-20T00:01:00.000Z' }
  handler = (config) =>
    config.method === 'patch'
      ? Promise.resolve(response({ error: { code: 'CONFLICT', message: 'Source changed' } }, 409))
      : config.url === '/ingestion/sources'
        ? Promise.resolve(response({ items: [fresh], nextCursor: null }))
        : previous(config)
  await panel().get('[data-testid="toggle-source"]').trigger('click')
  await flushPromises()
  expect(panel().text()).toContain('Source changed')
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
  expect(calls.filter((c) => c.url === '/ingestion/sources' && c.method === 'get')).toHaveLength(2)
  expect(panel().get('input[type="checkbox"]').element).toHaveProperty('checked', false)
  expect(panel().get('[data-testid="toggle-source"]').attributes('disabled')).toBeDefined()
  handler = (config) =>
    config.method === 'patch'
      ? Promise.resolve(response({ ...fresh, enabled: true }))
      : previous(config)
  await panel().get('input[type="checkbox"]').setValue(true)
  await panel().get('[data-testid="toggle-source"]').trigger('click')
  await flushPromises()
  expect(JSON.parse(calls.filter((c) => c.method === 'patch')[1]?.data).expectedUpdatedAt).toBe(
    fresh.updatedAt,
  )
})

it.each([401, 403])('clears protected rows and form on source read denial %s', async (status) => {
  const page = await open()
  await panel().get('[data-testid="load-sources"]').trigger('click')
  await flushPromises()
  expect(panel().text()).toContain(source.name)
  await panel().get('#source-name').setValue('Protected draft name')
  const previous = handler
  handler = (config) =>
    config.url === '/ingestion/sources'
      ? Promise.resolve(
          response(
            { error: { code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', message: 'Denied' } },
            status,
          ),
        )
      : previous(config)
  await panel().get('[data-testid="load-sources"]').trigger('click')
  await flushPromises()
  expect(page.find('section[aria-labelledby="sources-title"]').exists()).toBe(false)
  expect(page.text()).not.toContain(source.name)
  expect(page.html()).not.toContain('Protected draft name')
})

it.each([401, 403])(
  'closes source management on write denial %s without mutation replay',
  async (status) => {
    const page = await open()
    await panel().get('[data-testid="load-sources"]').trigger('click')
    await flushPromises()
    await panel().get('input[type="checkbox"]').setValue(true)
    const previous = handler
    handler = (config) =>
      config.method === 'patch'
        ? Promise.resolve(
            response(
              { error: { code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', message: 'Denied' } },
              status,
            ),
          )
        : previous(config)
    await panel().get('[data-testid="toggle-source"]').trigger('click')
    await flushPromises()
    expect(page.find('section[aria-labelledby="sources-title"]').exists()).toBe(false)
    expect(page.text()).not.toContain(source.name)
    expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
  },
)

it('refreshes a conflicted source beyond the first page and never makes stale cached rows actionable', async () => {
  const other = { ...source, id: '000000000000000000000001', name: 'Other source' }
  const fresh = { ...source, updatedAt: '2026-10-20T00:05:00.000Z' }
  let conflict = false
  const previous = handler
  handler = (config) => {
    if (config.method === 'patch') {
      conflict = true
      return Promise.resolve(response({ error: { code: 'CONFLICT', message: 'Changed' } }, 409))
    }
    if (config.url === '/ingestion/sources')
      return Promise.resolve(
        response(
          config.params?.cursor
            ? { items: [conflict ? fresh : source], nextCursor: null }
            : { items: [other], nextCursor: other.id },
        ),
      )
    return previous(config)
  }
  await open()
  await panel().get('[data-testid="load-sources"]').trigger('click')
  await flushPromises()
  await panel().get('[data-testid="more-sources"]').trigger('click')
  await flushPromises()
  const row = () => panel().get(`[data-source-id="${source.id}"]`)
  await row().get('input[type="checkbox"]').setValue(true)
  await row().get('[data-testid="toggle-source"]').trigger('click')
  await flushPromises()
  expect(panel().text()).toContain('Source changed')
  expect(calls.filter((c) => c.url === '/ingestion/sources' && c.method === 'get')).toHaveLength(4)
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
  expect(row().get('input[type="checkbox"]').element).toHaveProperty('checked', false)
})

it('discards source rows after an uncertain write and requires an explicit fresh read', async () => {
  await open()
  await panel().get('[data-testid="load-sources"]').trigger('click')
  await flushPromises()
  await panel().get('input[type="checkbox"]').setValue(true)
  const previous = handler
  handler = (config) =>
    config.method === 'patch'
      ? Promise.reject(new Error('Synthetic lost response'))
      : previous(config)
  await panel().get('[data-testid="toggle-source"]').trigger('click')
  await flushPromises()
  expect(panel().text()).toContain('Reload sources before trying again')
  expect(panel().find('[data-testid="toggle-source"]').exists()).toBe(false)
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
})
