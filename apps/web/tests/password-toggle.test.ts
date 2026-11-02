import { flushPromises, mount } from '@vue/test-utils'
import LoginForm from '@web/modules/account/LoginForm.vue'
import RegisterForm from '@web/modules/account/RegisterForm.vue'
import { describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@web/lib/auth-client', () => ({
  authClient: { signIn: { email: vi.fn() }, signUp: { email: vi.fn() } },
}))
// Password-only sign-in: SharedSignIn falls back to the password field when methods are unavailable.
vi.mock('@web/lib/api-client', () => ({
  api: { infrastructure: { authMethods: vi.fn().mockRejectedValue(new Error('offline')) } },
}))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/login', name: 'login', component: { template: '<div />' } },
    { path: '/register', name: 'register', component: { template: '<div />' } },
    { path: '/forgot-password', name: 'forgot-password', component: { template: '<div />' } },
  ],
})

const toggles = async (form: Component, fields: Record<string, string>) => {
  const wrapper = mount(form, { global: { plugins: [router] } })
  await flushPromises()
  for (const [input, toggle] of Object.entries(fields)) {
    const field = wrapper.get(`#${input}`)
    const button = wrapper.get(`[data-testid="${toggle}"]`)
    expect(field.attributes('type')).toBe('password')
    expect(button.text()).toBe('Show')
    await button.trigger('click')
    expect(field.attributes('type')).toBe('text')
    expect(button.text()).toBe('Hide')
    expect(button.attributes('aria-pressed')).toBe('true')
    await button.trigger('click')
    expect(field.attributes('type')).toBe('password')
  }
  wrapper.unmount()
}

describe('password show and hide', () => {
  it('lets the login password be shown and hidden again', async () => {
    await toggles(LoginForm, { 'login-password': 'login-password-toggle' })
  })

  it('lets each sign-up password field be shown and hidden on its own', async () => {
    await toggles(RegisterForm, {
      'reg-password': 'reg-password-toggle',
      'reg-confirm': 'reg-confirm-toggle',
    })
  })
})
