import { flushPromises, mount } from '@vue/test-utils'
import RegisterPanel from '@web/modules/account/RegisterPanel.vue'
import AuthPage from '@web/pages/AuthPage.vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic SDK boundaries only, not live Google sign-in.
const sdk = vi.hoisted(() => ({ methods: vi.fn(), social: vi.fn(), signUp: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({ api: { infrastructure: { authMethods: sdk.methods } } }))
vi.mock('@web/lib/auth-client', () => ({
  authClient: { signIn: { social: sdk.social }, signUp: { email: sdk.signUp } },
}))
vi.mock('@web/modules/map-shell/PanelFrame.vue', () => ({
  default: { template: '<div><slot /></div>' },
}))

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})
beforeEach(() => {
  vi.resetAllMocks()
  sdk.methods.mockResolvedValue({
    password: true,
    google: true,
    emailOtp: true,
    passwordRecovery: true,
  })
  sdk.social.mockResolvedValue({ error: null })
})

const stub = { template: '<div />' }
const signUpPage = async (component: typeof AuthPage | typeof RegisterPanel, redirect?: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/sign-up', component, props: { mode: 'register' } },
      { path: '/sign-in', name: 'sign-in', component: stub },
      { path: '/login', name: 'login', component: stub },
      { path: '/:pathMatch(.*)*', component: stub },
    ],
  })
  await router.push({ path: '/sign-up', query: redirect ? { redirect } : {} })
  await router.isReady()
  const wrapper = mount(component, { props: { mode: 'register' }, global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
const callbacks = (path: string) => {
  const url = new URL(path, window.location.origin).href
  return expect.objectContaining({ provider: 'google', callbackURL: url, newUserCallbackURL: url })
}

it.each([
  ['the sign-up page', AuthPage],
  ['the sign-up panel', RegisterPanel],
] as const)('%s offers Google and returns new accounts to All Deals', async (_, component) => {
  const wrapper = await signUpPage(component)
  await wrapper.get('[data-testid="google-sign-up"]').trigger('click')
  await flushPromises()
  expect(sdk.social).toHaveBeenCalledWith(callbacks('/deals'))
  expect(sdk.signUp).not.toHaveBeenCalled()
})

it.each([
  ['the sign-up page', AuthPage],
  ['the sign-up panel', RegisterPanel],
] as const)(
  '%s sends Google sign-up from a Squad invite back to the room',
  async (_, component) => {
    const wrapper = await signUpPage(component, '/squad/join?code=KOPI')
    await wrapper.get('[data-testid="google-sign-up"]').trigger('click')
    await flushPromises()
    expect(sdk.social).toHaveBeenCalledWith(callbacks('/squad/join?code=KOPI'))
  },
)

it('hides Google when the server has it switched off', async () => {
  sdk.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: true,
    passwordRecovery: true,
  })
  const wrapper = await signUpPage(AuthPage)
  expect(wrapper.find('[data-testid="google-sign-up"]').exists()).toBe(false)
})

it('shows an error when Google sign-up cannot start', async () => {
  sdk.social.mockResolvedValue({ error: { status: 500 } })
  const wrapper = await signUpPage(AuthPage)
  await wrapper.get('[data-testid="google-sign-up"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe(
    'Google sign-up could not be completed. Please try again.',
  )
})
