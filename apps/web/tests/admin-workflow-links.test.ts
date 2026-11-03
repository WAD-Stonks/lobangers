import { flushPromises, mount } from '@vue/test-utils'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import {
  adminAuditHref,
  adminCatalogueHref,
  adminDealHref,
  adminRecordId,
  adminReturnTo,
} from '@web/lib/admin-workflow-links'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const id = '0123456789abcdef01234567'
it('constructs exact task links with validated identifiers and an encoded local return path', () => {
  const back = `/admin/ingestion?status=PENDING&draftId=${id}#queue-title`
  const deal = new URL(
    adminDealHref({ dealId: id, tab: 'review', returnTo: back }),
    'https://example.test',
  )
  expect(deal.pathname).toBe('/admin/deals')
  expect(Object.fromEntries(deal.searchParams)).toEqual({
    dealId: id,
    tab: 'review',
    returnTo: back,
  })
  expect(adminRecordId([id])).toBeUndefined()
  expect(adminRecordId('invalid')).toBeUndefined()
  expect(adminCatalogueHref({ kind: 'venues', merchantId: id, recordId: id })).toContain(
    `merchantId=${id}&recordId=${id}`,
  )
  expect(adminAuditHref({ userId: id, returnTo: 'https://other.test' })).toBe(
    `/admin/audit?userId=${id}`,
  )
})
it.each([
  'https://evil.test/admin',
  '//evil.test/admin',
  '/\\evil.test/admin',
  '/admin/../login',
  '/login',
  ['/admin'],
  `/admin?${'x'.repeat(4000)}`,
])('refuses unsafe or non-admin return target %s', (value) => {
  expect(adminReturnTo(value)).toBeUndefined()
})
it('uses SPA navigation so protected recovery ledgers survive task handoffs', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/admin/ingestion')
  const push = vi.spyOn(router, 'push')
  const wrapper = mount(AdminTaskLink, {
    props: { to: `/admin/deals?dealId=${id}` },
    slots: { default: 'Open deal' },
    global: { plugins: [router] },
  })
  await wrapper.get('a').trigger('click')
  await flushPromises()
  expect(push).toHaveBeenCalledWith(`/admin/deals?dealId=${id}`)
  expect(router.currentRoute.value.path).toBe('/admin/deals')
  push.mockClear()
  await wrapper.get('a').trigger('click', { ctrlKey: true })
  expect(push).not.toHaveBeenCalled()
  await wrapper.setProps({ disabled: true })
  expect(wrapper.get('a').attributes('href')).toBeUndefined()
  await wrapper.get('a').trigger('click')
  expect(push).not.toHaveBeenCalled()
  await wrapper.setProps({ disabled: false, to: '//evil.test' })
  expect(wrapper.get('a').attributes('href')).toBeUndefined()
  expect(wrapper.get('a').attributes('aria-disabled')).toBe('true')
  wrapper.unmount()
})
