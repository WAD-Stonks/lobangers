import { flushPromises, mount } from '@vue/test-utils'
import AdminShell from '@web/components/admin/AdminShell.vue'
import { expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const destinations = [
  '/admin',
  '/admin/deals',
  '/admin/catalogue',
  '/admin/moderation',
  '/admin/accounts',
  '/admin/ingestion',
  '/admin/audit',
]
it.each(destinations)('marks only the current admin page at %s', async (path) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: destinations.map((path) => ({ path, component: AdminShell })),
  })
  await router.push(path)
  const wrapper = mount(AdminShell, {
    props: { title: 'Administration' },
    global: {
      plugins: [router],
      stubs: { AdminSessionControls: true },
    },
    slots: { default: '<p>Protected page content</p>' },
  })
  const current = wrapper.findAll('nav[aria-label="Administration"] a[aria-current="page"]')
  expect(current).toHaveLength(1)
  expect(current[0]?.attributes('href')).toBe(path)
  expect(wrapper.get('h1').text()).toBe('Administration')
  expect(wrapper.text()).toContain('Protected page content')
  wrapper.unmount()
})

it('uses concise navigation and changes routes without a document reload', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: destinations.map((path) => ({ path, component: AdminShell })),
  })
  await router.push('/admin')
  const wrapper = mount(AdminShell, {
    global: { plugins: [router], stubs: { AdminSessionControls: true } },
  })
  expect(wrapper.findAll('nav[aria-label="Administration"] a').map((link) => link.text())).toEqual([
    'Overview',
    'Deals',
    'Catalogue',
    'Moderation',
    'Accounts',
    'Ingestion',
    'Audit',
  ])
  expect(wrapper.find('.admin-eyebrow').exists()).toBe(false)
  await wrapper.get('nav a[href="/admin/accounts"]').trigger('click', { button: 0 })
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/admin/accounts')
  expect(wrapper.get('nav [aria-current="page"]').text()).toBe('Accounts')
  wrapper.unmount()
})
