import { flushPromises, mount } from '@vue/test-utils'
import AdminShell from '@web/components/admin/AdminShell.vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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

const viewport = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}
beforeEach(() => {
  viewport(1024)
  // JSDOM has no dialog top layer; browser-native modality is reviewed separately.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute('open', '')
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open')
      },
    },
  })
})
afterEach(() => {
  viewport(1024)
  document.body.style.overflow = ''
  vi.restoreAllMocks()
})

it('contains mobile drawer keyboard focus, dismisses via Escape/backdrop and returns focus', async () => {
  viewport(390)
  document.body.style.overflow = 'auto'
  const wrapper = mount(AdminShell, {
    attachTo: document.body,
    global: { stubs: { AdminSessionControls: true } },
  })
  const toggle = wrapper.get<HTMLButtonElement>('button[aria-label="Open navigation"]')
  toggle.element.focus()
  await toggle.trigger('click')
  await flushPromises()
  const dialog = wrapper.get<HTMLDialogElement>('dialog')
  const close = wrapper.get<HTMLButtonElement>('button[aria-label="Close navigation"]')
  expect(dialog.element.open).toBe(true)
  expect(dialog.attributes('aria-label')).toBe('Administration navigation')
  expect(toggle.attributes('aria-expanded')).toBe('true')
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.activeElement).toBe(close.element)
  const last = wrapper.get<HTMLAnchorElement>('a[href="/browse"]')
  last.element.focus()
  await last.trigger('keydown', { key: 'Tab' })
  expect(document.activeElement).toBe(close.element)
  await close.trigger('keydown', { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(last.element)
  await dialog.trigger('cancel')
  await flushPromises()
  expect(dialog.element.open).toBe(false)
  expect(document.activeElement).toBe(toggle.element)
  expect(document.body.style.overflow).toBe('auto')
  await toggle.trigger('click')
  await flushPromises()
  await dialog.trigger('click')
  expect(dialog.element.open).toBe(false)
  // A queued native close event from the previous opening must not close a new one.
  await toggle.trigger('click')
  await dialog.trigger('close')
  expect(dialog.element.open).toBe(true)
  await dialog.trigger('keydown', { key: 'Escape' })
  expect(dialog.element.open).toBe(false)
  expect(document.activeElement).toBe(toggle.element)
  wrapper.unmount()
})

it('closes mobile navigation on router changes, resize and disposal without losing scroll state', async () => {
  viewport(320)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: destinations.map((path) => ({ path, component: AdminShell })),
  })
  await router.push('/admin')
  const wrapper = mount(AdminShell, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { AdminSessionControls: true } },
  })
  const open = async () => {
    await wrapper.get('button[aria-label="Open navigation"]').trigger('click')
    await flushPromises()
  }
  await open()
  await wrapper.get('nav a[href="/admin"]').trigger('click', { button: 0 })
  await flushPromises()
  expect(wrapper.get<HTMLDialogElement>('dialog').element.open).toBe(false)
  await open()
  await wrapper.get('nav a[href="/admin/accounts"]').trigger('click', { button: 0 })
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/admin/accounts')
  expect(wrapper.get<HTMLDialogElement>('dialog').element.open).toBe(false)
  expect(document.body.style.overflow).toBe('')
  await open()
  viewport(1200)
  await flushPromises()
  expect(wrapper.find('dialog').exists()).toBe(false)
  expect(wrapper.find('aside').exists()).toBe(true)
  expect(document.body.style.overflow).toBe('')
  viewport(390)
  await flushPromises()
  await open()
  wrapper.unmount()
  expect(document.body.style.overflow).toBe('')
})

it('retains the desktop rail preference across page shell remounts', async () => {
  const options = { global: { stubs: { AdminSessionControls: true } } }
  const first = mount(AdminShell, options)
  await first.get('button[aria-label="Collapse sidebar"]').trigger('click')
  first.unmount()
  const next = mount(AdminShell, options)
  expect(next.classes()).toContain('admin-shell--collapsed')
  await next.get('button[aria-label="Expand sidebar"]').trigger('click')
  next.unmount()
})

it('provides a collapsible labelled desktop sidebar and one task landmark', async () => {
  const wrapper = mount(AdminShell, {
    global: { stubs: { AdminSessionControls: true } },
    slots: { default: '<section aria-label="Records">Records</section>' },
  })
  expect(wrapper.findAll('main')).toHaveLength(1)
  expect(wrapper.get('aside').attributes('id')).toBe('admin-sidebar')
  const toggle = wrapper.get('button[aria-label="Collapse sidebar"]')
  expect(toggle.attributes('aria-controls')).toBe('admin-sidebar')
  await toggle.trigger('click')
  expect(wrapper.classes()).toContain('admin-shell--collapsed')
  expect(wrapper.get('nav a[href="/admin/accounts"]').attributes('title')).toBe('Accounts')
  expect(wrapper.get('nav a[href="/admin/accounts"]').attributes('aria-label')).toBe('Accounts')
  await wrapper.get('button[aria-label="Expand sidebar"]').trigger('click')
  expect(wrapper.classes()).not.toContain('admin-shell--collapsed')
  wrapper.unmount()
})

it('preserves modified link clicks and navigates Back to map through the router', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...destinations, '/browse'].map((path) => ({ path, component: AdminShell })),
  })
  await router.push('/admin')
  const wrapper = mount(AdminShell, {
    global: { plugins: [router], stubs: { AdminSessionControls: true } },
  })
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
    const event = new MouseEvent('click', { button: 0, [modifier]: true, cancelable: true })
    const link = wrapper.get('nav a[href="/admin/accounts"]').element
    let shellPrevented = true
    link.addEventListener(
      'click',
      (event) => {
        shellPrevented = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )
    link.dispatchEvent(event)
    expect(shellPrevented).toBe(false)
  }
  expect(router.currentRoute.value.path).toBe('/admin')
  await wrapper.get('a[href="/browse"]').trigger('click', { button: 0 })
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/browse')
  wrapper.unmount()
})
