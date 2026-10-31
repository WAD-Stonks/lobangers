import type { AdminUserAnalyticsResponse } from '@broke-oclock/contracts/platform-admin'
import { flushPromises, mount } from '@vue/test-utils'
import UserRegistrationAnalytics from '@web/components/admin/UserRegistrationAnalytics.vue'
import { ApiClientError } from '@web/lib/api-client'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ analytics: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: { platformAdmin: { userAnalytics: mocks.analytics } },
}))
const data: AdminUserAnalyticsResponse = {
  generatedAt: '2026-10-31T04:00:00Z',
  timeZone: 'Asia/Singapore',
  totalUsers: 20,
  newUsersThisWeek: 4,
  weeks: Array.from({ length: 8 }, (_, index) => ({
    weekStart: new Date(Date.parse('2026-09-06T16:00:00Z') + index * 7 * 86400000).toISOString(),
    weekEnd: new Date(Date.parse('2026-09-13T16:00:00Z') + index * 7 * 86400000).toISOString(),
    newUsers: index === 7 ? 4 : 0,
  })),
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.analytics.mockResolvedValue(data)
})
it('renders totals, all eight weeks, Singapore labels and a current-week partial indicator', async () => {
  const w = mount(UserRegistrationAnalytics)
  await flushPromises()
  expect(w.findAll('dd').map((item) => item.text())).toEqual(['20', '4'])
  expect(w.findAll('.registration-weeks li')).toHaveLength(8)
  expect(w.get('.registration-week-label time').text()).toContain('7 Sept')
  expect(w.text()).toContain('This week · so far')
  expect(w.findAll('.registration-track > span')[7]?.attributes('style')).toContain('width: 100%')
  expect(w.findAll('.registration-track > span')[0]?.attributes('style')).toContain('width: 0%')
  w.unmount()
})
it('keeps zero weeks visible and retries a safe error independently', async () => {
  mocks.analytics.mockRejectedValueOnce(new Error('private database details'))
  const w = mount(UserRegistrationAnalytics)
  await flushPromises()
  expect(w.text()).toContain('The rest of the overview is still available')
  expect(w.text()).not.toContain('private database details')
  mocks.analytics.mockResolvedValueOnce({
    ...data,
    totalUsers: 0,
    newUsersThisWeek: 0,
    weeks: data.weeks.map((week) => ({ ...week, newUsers: 0 })),
  })
  await w.get('button').trigger('click')
  await flushPromises()
  expect(w.text()).toContain('No registrations in these eight weeks')
  expect(w.findAll('.registration-weeks li')).toHaveLength(8)
  for (const bar of w.findAll('.registration-track > span'))
    expect(bar.attributes('style')).toContain('width: 0%')
  expect(mocks.analytics).toHaveBeenCalledTimes(2)
  w.unmount()
})
it.each(['UNAUTHORIZED', 'FORBIDDEN'] as const)(
  'signals %s to clear the parent overview',
  async (code) => {
    mocks.analytics.mockRejectedValueOnce(new ApiClientError(code, 403, code))
    const w = mount(UserRegistrationAnalytics)
    await flushPromises()
    expect(w.emitted('denied')).toEqual([[code]])
    expect(w.find('dd').exists()).toBe(false)
    w.unmount()
  },
)
it('does not expose a late response after unmount', async () => {
  let release!: (value: AdminUserAnalyticsResponse) => void
  mocks.analytics.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const w = mount(UserRegistrationAnalytics)
  await flushPromises()
  expect(w.text()).toContain('Loading registration analytics')
  w.unmount()
  release(data)
  await flushPromises()
  expect(w.emitted('denied')).toBeUndefined()
})
