import { flushPromises, mount } from '@vue/test-utils'
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

// Controlled public SDK state; the component, fresh probe and identity fences stay real.
const sdk = vi.hoisted(() => ({
  useSession: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('@web/lib/auth-client', () => ({ authClient: sdk }))
const native = shallowRef({
  data: null as unknown,
  error: null as unknown,
  isPending: true,
  isRefetching: true,
  refetch: sdk.refetch,
})
const identity = {
  user: { id: 'initial-flight-user', name: 'Fresh operator', email: 'fresh@example.test' },
  session: { id: 'initial-flight-session' },
}
const wrappers: ReturnType<typeof mount>[] = []
function render() {
  const wrapper = mount(AdminSessionControls)
  wrappers.push(wrapper)
  return wrapper
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function settleInitial(overrides: Partial<typeof native.value> = {}) {
  native.value = { ...native.value, isPending: false, isRefetching: false, ...overrides }
}
beforeEach(() => {
  vi.resetAllMocks()
  confirmAdminIdentity(null)
  native.value = {
    data: null,
    error: null,
    isPending: true,
    isRefetching: true,
    refetch: sdk.refetch,
  }
  sdk.useSession.mockReturnValue(native)
  sdk.refetch.mockResolvedValue(undefined)
  sdk.getSession.mockResolvedValue({ data: identity, error: null })
  sdk.signOut.mockResolvedValue({ data: { success: true }, error: null })
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  confirmAdminIdentity(null)
})

it('lets the initial native GET/POST settle before explicit renewal and fresh identity admission', async () => {
  const renewal = deferred<void>()
  sdk.refetch.mockReturnValue(renewal.promise)
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('section').attributes('aria-busy')).toBe('true')
  expect(wrapper.text()).toContain('Checking current session')
  expect(sdk.refetch).not.toHaveBeenCalled()
  expect(sdk.getSession).not.toHaveBeenCalled()

  // GET data alone is not completion: the native POST chain is still running.
  settleInitial({ isRefetching: true, data: identity })
  await flushPromises()
  expect(sdk.refetch).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('fresh@example.test')
  settleInitial()
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledExactlyOnceWith({ query: { disableCookieCache: true } })
  expect(sdk.getSession).not.toHaveBeenCalled()
  renewal.resolve(undefined)
  await flushPromises()
  expect(sdk.getSession).toHaveBeenCalledExactlyOnceWith({ query: { disableCookieCache: true } })
  expect(wrapper.text()).toContain('fresh@example.test')
  expect(wrapper.text()).toContain('Session active')
  expect(wrapper.get('section').attributes('aria-busy')).toBe('false')
})

it('fences superseded early focus and refresh-key waits without canceling the initial native chain', async () => {
  const wrapper = render()
  window.dispatchEvent(new Event('focus'))
  await wrapper.setProps({ refreshKey: 1 })
  await flushPromises()
  expect(sdk.refetch).not.toHaveBeenCalled()
  settleInitial()
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledTimes(1)
  expect(sdk.getSession).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('fresh@example.test')

  // After bootstrap each deliberate trigger still performs its own fresh read.
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  await wrapper.setProps({ refreshKey: 2 })
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledTimes(3)
  expect(sdk.getSession).toHaveBeenCalledTimes(3)
})

it('disposes the initial watcher and never starts late native or identity reads after unmount', async () => {
  const wrapper = render()
  await flushPromises()
  expect(sdk.refetch).not.toHaveBeenCalled()
  wrapper.unmount()
  wrappers.pop()
  settleInitial()
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(sdk.refetch).not.toHaveBeenCalled()
  expect(sdk.getSession).not.toHaveBeenCalled()
  expect(wrapper.emitted('closing')).toBeUndefined()
  expect(wrapper.emitted('signedOut')).toBeUndefined()
})

it('does not renew or reopen a signed-out generation when its initial wait settles', async () => {
  const wrapper = render()
  await flushPromises()
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(wrapper.emitted('signedOut')).toHaveLength(1)
  settleInitial()
  await flushPromises()
  expect(sdk.refetch).not.toHaveBeenCalled()
  expect(sdk.getSession).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('fresh@example.test')
})

it('keeps already-idle mount renewal immediate and preserves later overlapping freshness fences', async () => {
  settleInitial()
  const wrapper = render()
  expect(sdk.refetch).toHaveBeenCalledExactlyOnceWith({ query: { disableCookieCache: true } })
  await flushPromises()
  const old = deferred<{ data: typeof identity; error: null }>()
  sdk.getSession.mockReturnValueOnce(old.promise)
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  await wrapper.setProps({ refreshKey: 1 })
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledTimes(3)
  expect(sdk.getSession).toHaveBeenCalledTimes(3)
  old.resolve({
    data: { ...identity, user: { ...identity.user, email: 'late@example.test' } },
    error: null,
  })
  await flushPromises()
  expect(wrapper.text()).toContain('fresh@example.test')
  expect(wrapper.text()).not.toContain('late@example.test')
})

it('recovers from initial native failure only through explicit renewal and a fresh probe', async () => {
  const wrapper = render()
  settleInitial({ error: new Error('private initial failure') })
  sdk.refetch.mockImplementationOnce(async () => {
    native.value = { ...native.value, error: new Error('private explicit failure') }
  })
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledTimes(1)
  expect(sdk.getSession).not.toHaveBeenCalled()
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(wrapper.text()).toContain('Access remains closed')
  expect(wrapper.text()).not.toContain('private')
  sdk.refetch.mockImplementationOnce(async () => {
    native.value = { ...native.value, error: null }
  })
  const recheck = wrapper.findAll('button').find((button) => button.text() === 'Recheck session')
  expect(recheck).toBeDefined()
  await recheck?.trigger('click')
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledTimes(2)
  expect(sdk.getSession).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('fresh@example.test')
  expect(wrapper.text()).toContain('Deliberately reload access')
  expect(wrapper.emitted('accessReload')).toBeUndefined()
})

it('confirms native absence only through the fresh probe after the initial chain settles', async () => {
  sdk.getSession.mockResolvedValue({ data: null, error: null })
  const wrapper = render()
  settleInitial({ data: null })
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledTimes(1)
  expect(sdk.getSession).toHaveBeenCalledTimes(1)
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(wrapper.emitted('signedOut')).toHaveLength(1)
  expect(wrapper.find('[data-testid="admin-sign-out"]').exists()).toBe(false)
})

it('does not admit an incomplete fresh native identity after the initial chain settles', async () => {
  sdk.getSession.mockResolvedValue({ data: { user: identity.user }, error: null })
  const wrapper = render()
  settleInitial()
  await flushPromises()
  expect(sdk.refetch).toHaveBeenCalledTimes(1)
  expect(sdk.getSession).toHaveBeenCalledTimes(1)
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(wrapper.text()).toContain('Access remains closed')
  expect(wrapper.text()).not.toContain('fresh@example.test')
})
