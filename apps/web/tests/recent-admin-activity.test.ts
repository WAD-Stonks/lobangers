import type { PlatformAuditEntry } from '@broke-oclock/contracts/platform-admin'
import { flushPromises, mount } from '@vue/test-utils'
import RecentAdminActivity from '@web/components/admin/RecentAdminActivity.vue'
import { ApiClientError } from '@web/lib/api-client'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: { adminAudit: { list: mocks.list } },
}))
const entry: PlatformAuditEntry = {
  id: '0123456789abcdef01234567',
  actorId: '1123456789abcdef01234567',
  actorName: 'Synthetic admin',
  action: 'ROLE_CHANGED',
  targetUserId: '2123456789abcdef01234567',
  venueId: null,
  note: '<script>unsafe()</script>',
  roleBefore: 'USER',
  roleAfter: 'ADMIN',
  createdAt: '2026-10-31T00:00:00Z',
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.list.mockResolvedValue({ items: [entry], nextCursor: null })
})
it('requests the latest five entries, displays safe details and links to the complete audit history', async () => {
  const w = mount(RecentAdminActivity)
  await flushPromises()
  expect(mocks.list).toHaveBeenCalledWith({ limit: 5 })
  expect(w.get('h3').text()).toBe('Role changed')
  expect(w.text()).toContain('By Synthetic admin')
  expect(w.text()).toContain('Account · 2123456789abcdef01234567')
  expect(w.get('time').attributes('datetime')).toBe(entry.createdAt)
  expect(w.get('time').text()).toContain('8:00 am')
  expect(w.get('.activity-note').text()).toBe(entry.note)
  expect(w.find('script').exists()).toBe(false)
  expect(w.text()).toContain('Role: USER → ADMIN')
  expect(w.get('a').attributes('href')).toBe('/admin/audit')
  w.unmount()
})
it('preserves API order, caps the feed at five and supports non-account subjects', async () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    ...entry,
    id: `synthetic-${index}`,
    action: 'DEAL_APPROVED',
    subjectType: 'DEAL',
    subjectId: '3123456789abcdef01234567',
    targetUserId: null,
  }))
  mocks.list.mockResolvedValueOnce({ items: entries, nextCursor: 'next' })
  const w = mount(RecentAdminActivity)
  await flushPromises()
  expect(w.findAll('[data-testid="recent-activity-entry"]')).toHaveLength(5)
  expect(w.findAll('h3').every((heading) => heading.text() === 'Deal approved')).toBe(true)
  expect(w.text()).toContain('Deal · 3123456789abcdef01234567')
  expect(w.text()).toContain('synthetic-0')
  expect(w.text()).not.toContain('synthetic-5')
  w.unmount()
})
it('shows an honest empty state and can refresh into populated results', async () => {
  mocks.list.mockResolvedValueOnce({ items: [], nextCursor: null })
  const w = mount(RecentAdminActivity)
  await flushPromises()
  expect(w.text()).toContain('No recorded activity yet')
  await w.get('[data-testid="refresh-admin-activity"]').trigger('click')
  await flushPromises()
  expect(w.text()).toContain('Role changed')
  expect(mocks.list).toHaveBeenCalledTimes(2)
  w.unmount()
})
it('contains an independent safe error and retry without exposing diagnostics', async () => {
  mocks.list.mockRejectedValueOnce(new Error('private diagnostic'))
  const w = mount(RecentAdminActivity)
  await flushPromises()
  expect(w.text()).toContain('The rest of the overview is still available')
  expect(w.text()).not.toContain('private diagnostic')
  await w.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(w.text()).toContain('Role changed')
  expect(w.find('[role="alert"]').exists()).toBe(false)
  w.unmount()
})
it.each(['UNAUTHORIZED', 'FORBIDDEN'] as const)(
  'signals %s so the overview clears all protected data',
  async (code) => {
    mocks.list.mockRejectedValueOnce(new ApiClientError(code, 403, code))
    const w = mount(RecentAdminActivity)
    await flushPromises()
    expect(w.emitted('denied')).toEqual([[code]])
    expect(w.find('[data-testid="recent-activity-entry"]').exists()).toBe(false)
    w.unmount()
  },
)
it('disables duplicate reads and ignores a late failure after unmount', async () => {
  let reject!: (error: Error) => void
  mocks.list.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  const w = mount(RecentAdminActivity)
  await flushPromises()
  expect(w.get('[data-testid="refresh-admin-activity"]').attributes('disabled')).toBeDefined()
  expect(w.text()).toContain('Loading recent activity')
  w.unmount()
  reject(new ApiClientError('FORBIDDEN', 403, 'Denied'))
  await flushPromises()
  expect(w.emitted('denied')).toBeUndefined()
})
