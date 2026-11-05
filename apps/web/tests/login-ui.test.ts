import { flushPromises, mount } from '@vue/test-utils'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import LoginForm from '@web/modules/account/LoginForm.vue'
import LoginPanel from '@web/modules/account/LoginPanel.vue'
import AuthPage from '@web/pages/AuthPage.vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const sdk = vi.hoisted(() => ({
  methods: vi.fn(),
  password: vi.fn(),
  social: vi.fn(),
  send: vi.fn(),
  redeem: vi.fn(),
  request: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({ api: { infrastructure: { authMethods: sdk.methods } } }))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    signIn: { email: sdk.password, social: sdk.social, emailOtp: sdk.redeem },
    emailOtp: {
      sendVerificationOtp: sdk.send,
      requestPasswordReset: sdk.request,
      resetPassword: sdk.reset,
    },
  },
}))
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})
beforeEach(() => {
  vi.resetAllMocks()
  sdk.methods.mockResolvedValue({
    password: true,
    google: true,
    emailOtp: true,
    passwordRecovery: true,
  })
  for (const method of [sdk.password, sdk.social, sdk.send, sdk.redeem, sdk.request, sdk.reset])
    method.mockResolvedValue({ error: null })
})
const deferred = () => {
  let resolve!: (value: { error: null }) => void
  const promise = new Promise<{ error: null }>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function loginPage(destination: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: AuthPage, props: { mode: 'login' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      { path: '/register', name: 'register', component: { template: '<div />' } },
      { path: '/sign-up', name: 'sign-up', component: { template: '<div />' } },
      { path: '/forgot-password', name: 'forgot-password', component: { template: '<div />' } },
    ],
  })
  await router.push({ path: '/login', query: { redirect: destination } })
  await router.isReady()
  const wrapper = mount(AuthPage, { props: { mode: 'login' }, global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}
async function accountForm(destination: string) {
  const wrapper = mount(SharedSignIn, { props: { context: 'account', destination } })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper }
}
it.each(['account', 'admin'] as const)(
  'starts %s login with password and switches to an email code on request',
  async (context) => {
    const wrapper = mount(SharedSignIn, { props: { context }, attachTo: document.body })
    wrappers.push(wrapper)
    await flushPromises()
    const emailId = context === 'account' ? '#login-email' : '#admin-email'
    const passwordId = context === 'account' ? '#login-password' : '#admin-password'
    expect(wrapper.find(passwordId).exists()).toBe(true)
    expect(wrapper.find('[data-testid="otp-send"]').exists()).toBe(false)
    await wrapper.get(emailId).setValue('person@example.test')
    expect(sdk.send).not.toHaveBeenCalled()
    expect(sdk.password).not.toHaveBeenCalled()
    await wrapper.get(passwordId).setValue('synthetic-password')
    await wrapper.get('[data-testid="use-code"]').trigger('click')
    expect(wrapper.find(passwordId).exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>(emailId).element.value).toBe('person@example.test')
    expect(sdk.send).not.toHaveBeenCalled()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sdk.send).toHaveBeenCalledWith({ email: 'person@example.test', type: 'sign-in' })
    expect(wrapper.find('#sign-in-code').exists()).toBe(true)
    await wrapper.get('[data-testid="change-email"]').trigger('click')
    await wrapper.get('[data-testid="use-password"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get(passwordId).element)
  },
)

it('standalone authentication embeds shared login once and returns Google sign-in to All Deals', async () => {
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/sign-in', name: 'sign-in', component: AuthPage, props: { mode: 'login' } },
      { path: '/sign-up', name: 'sign-up', component: stub },
      { path: '/register', name: 'register', component: stub },
      { path: '/forgot-password', name: 'forgot-password', component: stub },
      { path: '/deals', component: stub },
      { path: '/', component: stub },
    ],
  })
  await router.push('/sign-in?redirect=/saved')
  await router.isReady()
  const wrapper = mount(AuthPage, { props: { mode: 'login' }, global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.findAll('h1')).toHaveLength(1)
  expect(wrapper.find('.auth-card').exists()).toBe(false)
  expect(wrapper.findAll('a').filter((link) => link.text() === 'Create an account')).toHaveLength(1)
  expect(wrapper.find('#login-password').exists()).toBe(true)
  await wrapper.get('[data-testid="google-sign-in"]').trigger('click')
  await flushPromises()
  expect(sdk.social).toHaveBeenCalledWith(
    expect.objectContaining({
      callbackURL: new URL('/deals', window.location.origin).href,
      newUserCallbackURL: new URL('/deals', window.location.origin).href,
    }),
  )
})

it.each(['account', 'admin'] as const)(
  'characterization: completed recovery returns %s sign-in to the new-password form with its notice',
  async (context) => {
    const wrapper = mount(SharedSignIn, { props: { context } })
    wrappers.push(wrapper)
    await flushPromises()
    const emailId = context === 'account' ? '#login-email' : '#admin-email'
    const passwordId = context === 'account' ? '#login-password' : '#admin-password'
    await wrapper.get(emailId).setValue('person@example.test')
    await wrapper.get('[data-testid="recovery-open"]').trigger('click')
    await wrapper.get('#recovery-email').setValue('person@example.test')
    await wrapper.get('[data-testid="recovery-request"]').trigger('submit')
    await flushPromises()
    await wrapper.get('#recovery-code').setValue('012345')
    await wrapper.get('#recovery-password').setValue('synthetic-new-password')
    await wrapper.get('[data-testid="recovery-reset"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#recovery-title').exists()).toBe(false)
    expect(wrapper.find(passwordId).exists()).toBe(true)
    expect(wrapper.find('[data-testid="use-password"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Password reset. Sign in again with your new password.',
    )
    expect(wrapper.get<HTMLInputElement>(passwordId).element.value).toBe('')
    expect(sdk.password).not.toHaveBeenCalled()
    expect(wrapper.emitted('signedIn')).toBeUndefined()
    await wrapper.get(passwordId).setValue('synthetic-new-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sdk.password).toHaveBeenCalledWith({
      email: 'person@example.test',
      password: 'synthetic-new-password',
    })
    expect(wrapper.emitted('signedIn')).toHaveLength(1)
  },
)

it('embeds shared login in the legacy panel without duplicate headings and with the All Deals callback', async () => {
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginPanel },
      { path: '/browse', name: 'browse', component: stub },
      { path: '/register', name: 'register', component: stub },
      { path: '/forgot-password', name: 'forgot-password', component: stub },
    ],
  })
  const destination = '/saved?tab=all#latest'
  await router.push({ path: '/login', query: { redirect: destination } })
  await router.isReady()
  const wrapper = mount(LoginPanel, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.findAll('h1')).toHaveLength(1)
  expect(wrapper.find('.auth-card').exists()).toBe(false)
  expect(wrapper.find('#login-password').exists()).toBe(true)
  expect(wrapper.findAll('a[href^="/register"]')).toHaveLength(1)
  await wrapper.get('[data-testid="google-sign-in"]').trigger('click')
  await flushPromises()
  expect(sdk.social).toHaveBeenCalledWith(
    expect.objectContaining({
      callbackURL: new URL('/deals', window.location.origin).href,
    }),
  )
})

it('normal login reuses the shared sign-in with configured providers and a single page heading', async () => {
  const { wrapper } = await loginPage('/saved')
  expect(wrapper.findComponent(LoginForm).findComponent(SharedSignIn).exists()).toBe(true)
  expect(wrapper.findAll('h1')).toHaveLength(1)
  expect(wrapper.find('main').exists()).toBe(false)
  expect(wrapper.find('[data-testid="google-sign-in"]').exists()).toBe(true)
  expect(wrapper.find('[data-testid="use-code"]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('administrator or merchant role')
})
it('normal Google preserves same-site destination query/hash and OAuth-error cleanup preserves redirect', async () => {
  const destination = '/saved?category=food#latest'
  window.history.replaceState(
    null,
    '',
    `/login?redirect=${encodeURIComponent(destination)}&error=access_denied&token=private`,
  )
  const { wrapper } = await accountForm(destination)
  expect(new URL(window.location.href).searchParams.get('redirect')).toBe(destination)
  expect(window.location.search).not.toContain('private')
  expect(wrapper.text()).toContain('Google sign-in could not be completed')
  await wrapper.get('[data-testid="google-sign-in"]').trigger('click')
  await flushPromises()
  const callback = new URL(destination, window.location.origin).href
  expect(sdk.social).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: callback,
    newUserCallbackURL: callback,
    errorCallbackURL: new URL(
      `/login?redirect=${encodeURIComponent(destination)}`,
      window.location.origin,
    ).href,
  })
})
it.each(['/saved?tab=all#top', '/submit-deal', 'https://evil.test', '//evil.test', '/\\evil.test'])(
  'normal password follows the current All Deals completion policy for %s',
  async (destination) => {
    const { wrapper, router } = await loginPage(destination)
    await wrapper.get('#login-email').setValue('person@example.test')
    await wrapper.get('#login-password').setValue('synthetic-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/deals')
  },
)
it.each(['/squad/join?code=KOPI', '/squad/KOPI'])(
  'password sign-in from a Squad invite returns to %s',
  async (destination) => {
    const { wrapper, router } = await loginPage(destination)
    await wrapper.get('#login-email').setValue('person@example.test')
    await wrapper.get('#login-password').setValue('synthetic-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(destination)
  },
)
it('Google sign-in from a Squad invite returns to the invite', async () => {
  const { wrapper } = await loginPage('/squad/join?code=KOPI')
  await wrapper.get('[data-testid="google-sign-in"]').trigger('click')
  await flushPromises()
  const callback = new URL('/squad/join?code=KOPI', window.location.origin).href
  expect(sdk.social).toHaveBeenCalledWith(
    expect.objectContaining({ callbackURL: callback, newUserCallbackURL: callback }),
  )
})
it('code sign-in is a dedicated step with cooldown, retry, change-email and password return', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const { wrapper } = await loginPage('/saved')
  await wrapper.get('[data-testid="use-code"]').trigger('click')
  await wrapper.get('#login-email').setValue('person@example.test')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('#login-password').exists()).toBe(false)
  expect(wrapper.find('#login-email').exists()).toBe(false)
  expect(wrapper.get('#sign-in-code').attributes('autocomplete')).toBe('one-time-code')
  expect(wrapper.get('[data-testid="otp-resend"]').attributes('disabled')).toBeDefined()
  sdk.redeem.mockResolvedValueOnce({ error: { status: 400 } })
  await wrapper.get('#sign-in-code').setValue('012345')
  await wrapper.get('[data-testid="otp-form"]').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Code sign-in could not be completed')
  expect(wrapper.get<HTMLInputElement>('#sign-in-code').element.value).toBe('')
  await vi.advanceTimersByTimeAsync(30000)
  await wrapper.get('[data-testid="otp-resend"]').trigger('click')
  await flushPromises()
  expect(sdk.send).toHaveBeenCalledTimes(2)
  await wrapper.get('[data-testid="change-email"]').trigger('click')
  expect(wrapper.find('#sign-in-code').exists()).toBe(false)
  expect(wrapper.find('#login-password').exists()).toBe(false)
  expect(wrapper.get('[data-testid="otp-send"]').attributes('disabled')).toBeDefined()
  await vi.advanceTimersByTimeAsync(30000)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  await wrapper.get('[data-testid="use-password"]').trigger('click')
  expect(wrapper.find('#login-password').exists()).toBe(true)
})
it('locks recovery cancel while pending and ignores a result after unmount', async () => {
  const { wrapper } = await loginPage('/saved')
  await wrapper.get('[data-testid="recovery-open"]').trigger('click')
  await wrapper.get('#recovery-email').setValue('person@example.test')
  const request = deferred()
  sdk.request.mockReturnValue(request.promise)
  await wrapper.get('[data-testid="recovery-request"]').trigger('submit')
  expect(wrapper.get('[data-testid="recovery-cancel"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="recovery-cancel"]').trigger('click')
  expect(wrapper.find('#recovery-title').exists()).toBe(true)
  wrapper.unmount()
  request.resolve({ error: null })
  await flushPromises()
  expect(wrapper.emitted('signedIn')).toBeUndefined()
})
it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test'])(
  'normal Google rejects untrusted callback destination %s',
  async (destination) => {
    const { wrapper } = await accountForm(destination)
    await wrapper.get('[data-testid="google-sign-in"]').trigger('click')
    await flushPromises()
    expect(sdk.social).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: new URL('/', window.location.origin).href,
      newUserCallbackURL: new URL('/', window.location.origin).href,
      errorCallbackURL: new URL('/login?redirect=%2F', window.location.origin).href,
    })
  },
)
it.each(['disabled', 'unavailable'])(
  'normal password fallback works when optional providers are %s',
  async (availability) => {
    if (availability === 'disabled')
      sdk.methods.mockResolvedValue({
        password: true,
        google: false,
        emailOtp: false,
        passwordRecovery: false,
      })
    else sdk.methods.mockRejectedValue(new Error('private projection failure'))
    const { wrapper } = await loginPage('/')
    expect(wrapper.find('[data-testid="google-sign-in"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="otp-send"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="recovery-open"]').exists()).toBe(false)
    expect(wrapper.find('a[href="/forgot-password"]').exists()).toBe(true)
    const registration = new URL(
      wrapper.get('.auth-page__switch a').attributes('href') ?? '',
      window.location.origin,
    )
    expect(registration.pathname).toBe('/sign-up')
    expect(registration.searchParams.get('redirect')).toBe('/')
    await wrapper.get('#login-email').setValue('person@example.test')
    await wrapper.get('#login-password').setValue('synthetic-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sdk.password).toHaveBeenCalledTimes(1)
    expect(wrapper.get<HTMLInputElement>('#login-password').element.value).toBe('')
    expect(wrapper.text()).not.toContain('private projection failure')
  },
)
it('generic send errors keep the password alternative available and allow a deliberate retry', async () => {
  sdk.send.mockResolvedValueOnce({ error: { status: 400, message: 'private account details' } })
  const { wrapper } = await loginPage('/')
  await wrapper.get('[data-testid="use-code"]').trigger('click')
  await wrapper.get('#login-email').setValue('person@example.test')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Code could not be sent. Please try again.')
  expect(wrapper.find('#login-password').exists()).toBe(false)
  expect(wrapper.find('[data-testid="use-password"]').exists()).toBe(true)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('#sign-in-code').exists()).toBe(true)
})
it('locks the normal-login mailbox during password sign-in and completes the requested redirect', async () => {
  const pending = deferred()
  sdk.password.mockReturnValue(pending.promise)
  const { wrapper, router } = await loginPage('/saved')
  await wrapper.get('#login-email').setValue('person@example.test')
  await wrapper.get('#login-password').setValue('synthetic-password')
  await wrapper.get('form').trigger('submit')
  await wrapper.get('form').trigger('submit')
  expect(sdk.password).toHaveBeenCalledTimes(1)
  expect(wrapper.get<HTMLInputElement>('#login-email').element.disabled).toBe(true)
  pending.resolve({ error: null })
  await flushPromises()
  expect(wrapper.findComponent(LoginForm).emitted('signedIn')).toHaveLength(1)
  expect(router.currentRoute.value.fullPath).toBe('/deals')
  expect(wrapper.get<HTMLInputElement>('#login-email').element.disabled).toBe(false)
  expect(wrapper.get<HTMLInputElement>('#login-password').element.value).toBe('')
})
it('characterization: does not emit a code success received after unmount', async () => {
  const { wrapper } = await loginPage('/')
  await wrapper.get('[data-testid="use-code"]').trigger('click')
  await wrapper.get('#login-email').setValue('person@example.test')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  const pending = deferred()
  sdk.redeem.mockReturnValue(pending.promise)
  await wrapper.get('#sign-in-code').setValue('012345')
  await wrapper.get('[data-testid="otp-form"]').trigger('submit')
  const shared = wrapper.findComponent(SharedSignIn)
  wrapper.unmount()
  pending.resolve({ error: null })
  await flushPromises()
  expect(shared.emitted('signedIn')).toBeUndefined()
})
it('moves focus to recovery email and back to sign-in email on cancel', async () => {
  const wrapper = mount(SharedSignIn, { attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.get('[data-testid="recovery-open"]').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('#recovery-email').element)
  await wrapper.get('[data-testid="recovery-cancel"]').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('#admin-email').element)
})
it('moves keyboard focus into the dedicated code step after the pending send unlocks', async () => {
  const wrapper = mount(SharedSignIn, { attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.get('[data-testid="use-code"]').trigger('click')
  await wrapper.get('#admin-email').setValue('person@example.test')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('#sign-in-code').element)
})
