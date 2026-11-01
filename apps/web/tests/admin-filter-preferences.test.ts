import type { AdminDealsClient } from '@broke-oclock/api-client/admin-deals'
import { flushPromises, mount } from '@vue/test-utils'
import { rememberAdminFilters } from '@web/lib/admin-filter-preferences'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { useAdminDeals } from '@web/modules/admin-deals/use-admin-deals'
import { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'
import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  requests: vi.fn(),
  audit: vi.fn(),
  session: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: {
    platformAdmin: { accounts: mocks.accounts, requests: mocks.requests, audit: mocks.audit },
  },
}))
vi.mock('@web/lib/auth-client', () => ({ authClient: { getSession: mocks.session } }))
const identity = { user: { id: 'synthetic-admin' }, session: { id: 'synthetic-session' } }
beforeEach(() => {
  confirmAdminIdentity(null)
  confirmAdminIdentity(identity)
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ data: identity, error: null })
  for (const method of [mocks.accounts, mocks.requests, mocks.audit])
    method.mockResolvedValue({ items: [], nextCursor: null })
})

it('restores copied filter preferences and forgets them on logout, identity or session replacement', () => {
  const defaults = { search: '', role: '' }
  const memory = rememberAdminFilters('accounts', defaults)
  memory.save({ search: 'alice', role: 'MERCHANT' })
  const restored = memory.read()
  restored.search = 'unsaved draft'
  expect(memory.read().search).toBe('alice')
  expect(rememberAdminFilters('deals', { search: '' }).read()).toEqual({ search: '' })
  confirmAdminIdentity({ user: { id: 'another-admin' }, session: { id: 'another-session' } })
  memory.save({ search: 'late old identity', role: 'ADMIN' })
  expect(rememberAdminFilters('accounts', defaults).read()).toEqual(defaults)
  const replacement = rememberAdminFilters('accounts', defaults)
  replacement.save({ search: 'replacement', role: 'USER' })
  confirmAdminIdentity({ user: { id: 'another-admin' }, session: { id: 'new-session' } })
  expect(rememberAdminFilters('accounts', defaults).read()).toEqual(defaults)
  rememberAdminFilters('accounts', defaults).save({ search: 'current', role: 'USER' })
  confirmAdminIdentity(null)
  expect(rememberAdminFilters('accounts', defaults).read()).toEqual(defaults)
})

const openAccounts = () => {
  let state!: ReturnType<typeof usePlatformAdmin>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = usePlatformAdmin()
        return () => null
      },
    }),
  )
  return { wrapper, state }
}
it('restores applied account filters on remount, ignores unsubmitted drafts and clears to the first page', async () => {
  const first = openAccounts()
  await flushPromises()
  first.state.accountSearch = ' alice '
  first.state.roleFilter = 'MERCHANT'
  await first.state.searchAccounts()
  expect(mocks.accounts).toHaveBeenLastCalledWith({ limit: 20, search: 'alice', role: 'MERCHANT' })
  first.state.accountSearch = 'not submitted'
  first.wrapper.unmount()
  const second = openAccounts()
  await flushPromises()
  expect(second.state.accountSearch).toBe('alice')
  expect(second.state.roleFilter).toBe('MERCHANT')
  expect(mocks.accounts).toHaveBeenLastCalledWith({ limit: 20, search: 'alice', role: 'MERCHANT' })
  expect(second.state.selectedId).toBe('')
  expect(second.state.confirmed).toBe(false)
  await second.state.clearAccountFilters()
  expect(mocks.accounts).toHaveBeenLastCalledWith({ limit: 20 })
  second.wrapper.unmount()
  const third = openAccounts()
  await flushPromises()
  expect(third.state.accountSearch).toBe('')
  expect(third.state.roleFilter).toBe('')
  third.wrapper.unmount()
})
it('restores deal filters without consent and keeps pagination on applied filters instead of drafts', async () => {
  const list = vi.fn().mockResolvedValue({ items: [], nextCursor: 'next-page' })
  const client = { list } as unknown as AdminDealsClient
  const first = useAdminDeals(client, vi.fn())
  Object.assign(first.filters, {
    search: ' noodles ',
    origin: 'IMPORTED',
    reviewStatus: 'PENDING',
    includeDeleted: true,
  })
  await first.load()
  first.filters.search = 'unsubmitted draft'
  await first.load(true)
  expect(list).toHaveBeenLastCalledWith(
    expect.objectContaining({
      search: 'noodles',
      origin: 'IMPORTED',
      reviewStatus: 'PENDING',
      includeDeleted: 'true',
      cursor: 'next-page',
    }),
  )
  first.consent.note = 'Do not remember this'
  first.consent.confirmed = true
  first.dispose()
  const second = useAdminDeals(client, vi.fn())
  expect(second.filters.search).toBe('noodles')
  expect(second.filters.includeDeleted).toBe(true)
  expect(second.consent).toEqual({ note: '', confirmed: false })
  expect(second.selected.value).toBeNull()
  await second.load()
  expect(list.mock.lastCall?.[0]).not.toHaveProperty('cursor')
  await second.clearFilters()
  expect(list).toHaveBeenLastCalledWith({ includeDeleted: 'false', limit: 20 })
  second.dispose()
})
