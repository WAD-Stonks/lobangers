import { flushPromises, mount } from '@vue/test-utils'
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'
import AdminShell from '@web/components/admin/AdminShell.vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('@web/lib/auth-client', () => ({ authClient: auth }))
const wrappers: ReturnType<typeof mount>[] = []
let sequence = 0
beforeEach(() => {
  vi.clearAllMocks()
  auth.refetch.mockResolvedValue(undefined)
  auth.useSession.mockReturnValue({ value: { refetch: auth.refetch, error: null } })
  auth.getSession.mockResolvedValue({
    data: {
      user: { id: 'operator', name: 'Synthetic operator', email: 'operator@example.test' },
      session: { id: `shell-${++sequence}` },
    },
    error: null,
  })
  auth.signOut.mockResolvedValue({ data: { success: true }, error: null })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => {
    wrapper.unmount()
  })
})

it('keeps one real native observer alive while the account disclosure opens and closes', async () => {
  const wrapper = mount(AdminShell, { attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  const controller = wrapper.getComponent(AdminSessionControls).element
  const account = wrapper.get<HTMLButtonElement>('button[aria-label="Admin account"]')
  expect(account.attributes('aria-expanded')).toBe('false')
  expect(wrapper.get('[data-testid="admin-sign-out"]').isVisible()).toBe(false)
  await account.trigger('click')
  expect(wrapper.get('[data-testid="admin-sign-out"]').isVisible()).toBe(true)
  expect(wrapper.text()).toContain('operator@example.test')
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('keydown', { key: 'Escape' })
  expect(account.attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(account.element)
  await account.trigger('click')
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  await flushPromises()
  expect(account.attributes('aria-expanded')).toBe('false')
  expect(wrapper.getComponent(AdminSessionControls).element).toBe(controller)
  expect(auth.useSession).toHaveBeenCalledTimes(1)
  expect(auth.refetch).toHaveBeenCalledTimes(1)
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(auth.refetch).toHaveBeenCalledTimes(2)
  await wrapper.setProps({ refreshKey: 1 })
  await flushPromises()
  expect(auth.refetch).toHaveBeenCalledTimes(3)
  wrapper.unmount()
  wrappers.pop()
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(auth.refetch).toHaveBeenCalledTimes(3)
})

it('closes account disclosure on SPA route changes without remounting the observer', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/admin', '/admin/accounts'].map((path) => ({ path, component: AdminShell })),
  })
  await router.push('/admin')
  const wrapper = mount(AdminShell, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.get('button[aria-label="Admin account"]').trigger('click')
  await router.push('/admin/accounts')
  await flushPromises()
  expect(wrapper.get('button[aria-label="Admin account"]').attributes('aria-expanded')).toBe(
    'false',
  )
  expect(auth.useSession).toHaveBeenCalledTimes(1)
})

it('retains capture/event contracts and keeps uncertain-session recovery visible outside the menu', async () => {
  auth.signOut.mockRejectedValue(new Error('Synthetic uncertain sign-out'))
  const captures: string[] = []
  const wrapper = mount(AdminShell, {
    attachTo: document.body,
    attrs: {
      onClickCapture: (event: MouseEvent) => {
        if ((event.target as Element).closest('[data-testid="admin-sign-out"]'))
          captures.push('capture')
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.get('button[aria-label="Admin account"]').trigger('click')
  const priorClosures = wrapper.emitted('closing')?.length ?? 0
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(captures).toEqual(['capture'])
  expect(wrapper.emitted('closing')).toHaveLength(priorClosures + 1)
  expect(wrapper.emitted('signedOut')).toBeUndefined()
  await wrapper.get('button[aria-label="Admin account"]').trigger('click')
  const recheck = wrapper.findAll('button').find((button) => button.text() === 'Recheck session')
  expect(recheck?.isVisible()).toBe(true)
  await recheck?.trigger('click')
  await flushPromises()
  const reload = wrapper.get('[data-testid="admin-access-reload"]')
  expect(reload.isVisible()).toBe(true)
  await reload.trigger('click')
  expect(wrapper.emitted('accessReload')).toHaveLength(1)
  await wrapper.get('button[aria-label="Admin account"]').trigger('click')
  auth.signOut.mockResolvedValue({ data: { success: true }, error: null })
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('signedOut')).toHaveLength(1)
})
