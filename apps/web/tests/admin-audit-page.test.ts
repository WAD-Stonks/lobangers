import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Synthetic native and REST boundaries. Does not establish live auth acceptance.
const rest = vi.hoisted(() => ({
  audit: vi.fn(),
  session: vi.fn(),
  signOut: vi.fn(),
  methods: vi.fn(),
}))
vi.mock('@web/lib/api-client', async () => {
  const { ApiClientError } = await import('@broke-oclock/api-client')
  return {
    ApiClientError,
    api: { platformAdmin: { audit: rest.audit }, infrastructure: { authMethods: rest.methods } },
  }
})
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ value: { refetch: async () => {}, error: null } }),
    getSession: rest.session,
    signOut: rest.signOut,
  },
}))
beforeEach(() => {
  vi.resetAllMocks()
  rest.session.mockResolvedValue({
    data: {
      user: { id: 'a'.repeat(24), name: 'Synthetic audit operator', email: 'audit@example.test' },
      session: { id: 'native-a' },
    },
    error: null,
  })
  rest.signOut.mockResolvedValue({ data: { success: true }, error: null })
  rest.audit.mockResolvedValue({ items: [], nextCursor: null })
  rest.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: false,
    passwordRecovery: false,
  })
})
const page = async () => (await import('@web/pages/AdminAuditPage.vue')).default
it('mounts audit investigation inside existing administrator session shell', async () => {
  const wrapper = mount(await page())
  await flushPromises()
  expect(wrapper.get('h1').text()).toBe('Audit investigation')
  expect(wrapper.text()).toContain('No audit entries match')
  expect(rest.audit).toHaveBeenCalledWith({ limit: 25 })
  wrapper.unmount()
})
it('does not read audit for absent native identity', async () => {
  rest.session.mockResolvedValue({ data: null, error: null })
  const wrapper = mount(await page())
  await flushPromises()
  expect(wrapper.text()).toContain('Sign in to view audit history')
  expect(rest.audit).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('synchronously closes the panel on sign-out and ignores a late audit response', async () => {
  let release!: (value: { items: []; nextCursor: null }) => void
  rest.audit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  rest.signOut.mockRejectedValueOnce(new Error('Synthetic sign-out timeout'))
  const wrapper = mount(await page())
  await flushPromises()
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  release({ items: [], nextCursor: null })
  await flushPromises()
  expect(wrapper.text()).toContain('Server sign-out could not be confirmed')
  expect(wrapper.find('[name="actorId"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('No audit entries match')
  wrapper.unmount()
})

const nativeIdentity = (userId = 'a'.repeat(24), sessionId = 'native-a') => ({
  error: null,
  data: {
    user: { id: userId, name: userId, email: `${userId}@example.test` },
    session: { id: sessionId, userId },
  },
})
const protectedAudit = {
  id: 'c'.repeat(24),
  actorId: 'a'.repeat(24),
  actorName: 'Synthetic prior actor',
  action: 'DEAL_UPDATED',
  targetUserId: null,
  venueId: null,
  subjectType: 'DEAL',
  subjectId: 'c'.repeat(24),
  detailsJson: null,
  note: 'PRIVATE PRIOR ACTOR ROW',
  roleBefore: null,
  roleAfter: null,
  createdAt: '2026-10-28T00:00:00Z',
}
it.each(['other-user', 'same-user-new-session'])(
  'closes warm original audit on confirmed %s, requires deliberate server reload and refuses denial',
  async (replacement) => {
    rest.session.mockResolvedValue(nativeIdentity())
    rest.audit.mockResolvedValue({ items: [protectedAudit], nextCursor: null })
    const wrapper = mount(await page())
    try {
      await flushPromises()
      expect(wrapper.text()).toContain(protectedAudit.note)
      rest.session.mockResolvedValue(
        nativeIdentity(replacement === 'other-user' ? 'b'.repeat(24) : 'a'.repeat(24), 'native-b'),
      )
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(wrapper.text()).not.toContain(protectedAudit.note)
      expect(rest.audit).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).not.toContain('Retry sign-out')
      rest.audit.mockRejectedValue(
        new (await import('@broke-oclock/api-client')).ApiClientError(
          'FORBIDDEN',
          403,
          'Forbidden',
        ),
      )
      await wrapper.get('[data-testid="admin-access-reload"]').trigger('click')
      await flushPromises()
      expect(rest.audit).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain('You do not have permission')
      expect(wrapper.text()).not.toContain(protectedAudit.note)
    } finally {
      wrapper.unmount()
    }
  },
)
it('same native session renewal retains warm audit and does not request extra authorization', async () => {
  rest.session.mockResolvedValue(nativeIdentity())
  rest.audit.mockResolvedValue({ items: [protectedAudit], nextCursor: null })
  const wrapper = mount(await page())
  try {
    await flushPromises()
    rest.session.mockResolvedValue({
      ...nativeIdentity(),
      data: {
        ...nativeIdentity().data,
        session: { ...nativeIdentity().data.session, expiresAt: '2026-11-01T00:00:00Z' },
      },
    })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.text()).toContain(protectedAudit.note)
    expect(rest.audit).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="admin-access-reload"]').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
it('replacement fences a delayed original audit read before new identity is displayed', async () => {
  rest.session.mockResolvedValue(nativeIdentity())
  let release: (value: { items: (typeof protectedAudit)[]; nextCursor: null }) => void = () => {
    throw new Error('Unstarted read')
  }
  rest.audit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const wrapper = mount(await page())
  try {
    await flushPromises()
    rest.session.mockResolvedValue(nativeIdentity('b'.repeat(24), 'native-b'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    release({ items: [protectedAudit], nextCursor: null })
    await flushPromises()
    expect(wrapper.text()).not.toContain(protectedAudit.note)
    expect(rest.audit).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="admin-access-reload"]').exists()).toBe(true)
  } finally {
    wrapper.unmount()
  }
})

afterEach(async () => {
  rest.session.mockResolvedValue({ data: null, error: null })
  const { createAdminSession } = await import('@web/lib/admin-session')
  const state = createAdminSession({
    closing: () => {},
    signedOut: () => {},
    accessReload: () => {},
  })
  await state.refresh()
  state.dispose()
})
