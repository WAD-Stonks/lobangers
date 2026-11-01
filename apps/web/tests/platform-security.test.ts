import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AccountSecurityPanel from '@web/modules/platform-security/AccountSecurityPanel.vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Labelled synthetic REST responses: mounted UI proof, not server authorization.
const rest = vi.hoisted(() => ({
  account: vi.fn(),
  sessions: vi.fn(),
  context: vi.fn(),
  suspend: vi.fn(),
  reinstate: vi.fn(),
  revokeSession: vi.fn(),
  revokeSessions: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  api: { platformSecurity: rest },
}))
const detail = {
  userId: 'synthetic-target',
  version: 7,
  emailVerified: false,
  state: 'ACTIVE',
  suspendedAt: null,
  methods: { passwordConfigured: true, googleLinked: false, emailOtpAvailable: true },
}
const session = {
  id: 'synthetic-session',
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-11-01T00:00:00.000Z',
  deviceLabel: '<img src=x> Synthetic browser',
}
const sessions = { userId: detail.userId, version: 7, items: [session], nextCursor: null }
const context = {
  actorUserId: 'synthetic-admin',
  freshLoginUntil: '2099-01-01T00:00:00.000Z',
  reauthenticationRequired: false,
}
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetAllMocks()
  rest.account.mockResolvedValue(detail)
  rest.sessions.mockResolvedValue(sessions)
  rest.context.mockResolvedValue(context)
  for (const key of ['suspend', 'reinstate', 'revokeSession', 'revokeSessions'] as const)
    rest[key].mockResolvedValue({ id: detail.userId, version: 8, affectedSessionCount: 1 })
})
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
})
async function open(props = {}) {
  const w = mount(AccountSecurityPanel, {
    props: { userId: detail.userId, accountVersion: 7, ...props },
  })
  wrappers.push(w)
  await flushPromises()
  return w
}
async function confirm(w: VueWrapper, note = 'Synthetic security review') {
  await w.get('[data-testid="security-note"]').setValue(note)
  await w.get('[data-testid="security-confirm"]').setValue(true)
}
it('fences target switches, disabled reads, unmount and old denials without protected resurrection', async () => {
  const old = deferred<typeof detail>()
  rest.account.mockReturnValueOnce(old.promise)
  const w = await open()
  rest.account.mockResolvedValue({ ...detail, userId: 'synthetic-b', version: 9 })
  rest.sessions.mockResolvedValue({ ...sessions, userId: 'synthetic-b', version: 9 })
  await w.setProps({ userId: 'synthetic-b', accountVersion: 9 })
  await flushPromises()
  old.reject({ code: 'FORBIDDEN' })
  await flushPromises()
  expect(w.text()).toContain('synthetic-b')
  expect(w.emitted('denied')).toBeUndefined()
  await confirm(w)
  await w.setProps({ disabled: true })
  expect(w.text()).not.toContain(session.deviceLabel)
  await w.get('[data-testid="security-reload"]').trigger('click')
  expect(rest.account).toHaveBeenCalledTimes(2)
  const gate = deferred<typeof detail>()
  rest.account.mockReturnValueOnce(gate.promise)
  await w.setProps({ disabled: false })
  await flushPromises()
  w.unmount()
  gate.resolve({ ...detail, userId: 'synthetic-b', version: 9 })
  await flushPromises()
  expect(w.emitted('changed')).toBeUndefined()
  const closed = await open({ disabled: true })
  expect(closed.text()).not.toContain(session.deviceLabel)
  expect(rest.account).toHaveBeenCalledTimes(3)
})
it('uses the highest accepted account/session/parent version and never unlocks on stale lower evidence', async () => {
  const gate = deferred<typeof detail>()
  rest.account.mockReturnValueOnce(gate.promise)
  rest.sessions.mockResolvedValue({ ...sessions, version: 8 })
  const w = await open()
  gate.resolve(detail)
  await flushPromises()
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).not.toHaveBeenCalled()
  expect(w.text()).toContain('Reload security')
  rest.account.mockResolvedValue({ ...detail, version: 8 })
  await w.get('[data-testid="security-reload"]').trigger('click')
  await flushPromises()
  await confirm(w)
  await w.setProps({ accountVersion: 9 })
  expect((w.get('[data-testid="security-confirm"]').element as HTMLInputElement).checked).toBe(
    false,
  )
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).not.toHaveBeenCalled()
  rest.account.mockResolvedValue({ ...detail, version: 9 })
  rest.sessions.mockResolvedValue({ ...sessions, version: 9 })
  await w.get('[data-testid="security-reload"]').trigger('click')
  await flushPromises()
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).toHaveBeenCalledExactlyOnceWith(detail.userId, {
    expectedVersion: 9,
    note: 'Synthetic security review',
    confirmed: true,
  })
})
it.each(['UNAUTHORIZED', 'FORBIDDEN'])(
  'clears protected data on current %s read denial and fences late siblings',
  async (code) => {
    const page = deferred<typeof sessions>()
    rest.account.mockRejectedValueOnce({ code })
    rest.sessions.mockReturnValueOnce(page.promise)
    const w = await open()
    expect(w.emitted('denied')).toEqual([[code]])
    page.resolve(sessions)
    await flushPromises()
    expect(w.text()).not.toContain(session.deviceLabel)
    expect(w.find('[data-testid="security-form"]').exists()).toBe(false)
  },
)
it('disables self controls using context identity, not target role or local clock', async () => {
  rest.context.mockResolvedValue({ ...context, actorUserId: detail.userId })
  const w = await open()
  expect(w.text()).toContain('Use your existing session controls')
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).not.toHaveBeenCalled()
})
it('treats local login age as a hint, handles exact freshness refusal without replay, and leaves reads usable', async () => {
  rest.context.mockResolvedValue({ ...context, freshLoginUntil: '2000-01-01T00:00:00.000Z' })
  const w = await open()
  expect(w.text()).toContain('Server checks freshness for every action')
  rest.suspend.mockRejectedValueOnce({
    code: 'PRECONDITION_FAILED',
    message: 'Fresh sign-in required',
  })
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  await flushPromises()
  expect(rest.suspend).toHaveBeenCalledOnce()
  expect(w.emitted('freshnessRequired')).toEqual([[]])
  expect(w.text()).toContain('Sign out using the existing session controls, then sign in again')
  expect(w.text()).not.toContain('MFA')
  expect((w.get('[data-testid="security-confirm"]').element as HTMLInputElement).checked).toBe(
    false,
  )
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).toHaveBeenCalledOnce()
  await w.get('[data-testid="security-reload"]').trigger('click')
  await flushPromises()
  expect(rest.account).toHaveBeenCalledTimes(2)
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).toHaveBeenCalledOnce()
  await w.setProps({ revision: 1 })
  await flushPromises()
  expect((w.get('[data-testid="security-confirm"]').element as HTMLInputElement).checked).toBe(
    false,
  )
})
it.each(['CONFLICT', 'UNKNOWN'])(
  'locks %s outcomes until fresh evidence, resets consent, and never automatically replays',
  async (code) => {
    const w = await open()
    rest.suspend.mockRejectedValueOnce(
      code === 'UNKNOWN' ? new Error('private synthetic transport failure') : { code },
    )
    await confirm(w)
    await w.get('[data-testid="security-form"]').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain(code === 'UNKNOWN' ? 'Result unknown' : 'Account changed')
    expect(w.text()).not.toContain('private synthetic')
    expect((w.get('[data-testid="security-note"]').element as HTMLTextAreaElement).value).toBe(
      code === 'UNKNOWN' ? 'Synthetic security review' : '',
    )
    await confirm(w)
    await w.get('[data-testid="security-form"]').trigger('submit')
    expect(rest.suspend).toHaveBeenCalledOnce()
    await w.get('[data-testid="security-reload"]').trigger('click')
    await flushPromises()
    if (code === 'UNKNOWN') expect(w.text()).toContain('Result unknown')
    await confirm(w)
    await w.get('[data-testid="security-form"]').trigger('submit')
    expect(rest.suspend).toHaveBeenCalledTimes(code === 'UNKNOWN' ? 1 : 2)
    if (code === 'UNKNOWN') {
      rest.account.mockResolvedValue({ ...detail, version: 8 })
      rest.sessions.mockResolvedValue({ ...sessions, version: 8 })
      await w.get('[data-testid="security-reload"]').trigger('click')
      await flushPromises()
      await confirm(w, 'Reviewed version eight')
      await w.get('[data-testid="security-form"]').trigger('submit')
      expect(rest.suspend).toHaveBeenCalledTimes(2)
    }
  },
)
it('reports completed write separately from failed follow-up read', async () => {
  const w = await open()
  rest.account.mockRejectedValueOnce(new Error('synthetic reload failure'))
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  await flushPromises()
  expect(w.text()).toContain('Security action completed.')
  expect(w.text()).toContain('Unable to load security data')
  expect(w.find('[data-testid="security-form"]').exists()).toBe(false)
  expect(w.emitted('changed')).toEqual([[{ id: detail.userId, version: 8 }]])
})
it('paginates safe session rows, resets consent on selection/evidence and revokes exactly one versus all', async () => {
  rest.sessions.mockResolvedValueOnce({ ...sessions, nextCursor: 'synthetic-cursor' })
  const gate = deferred<typeof sessions>()
  rest.sessions.mockReturnValueOnce(gate.promise)
  const w = await open()
  await w.get('[data-testid="security-action"]').setValue('session')
  await w.get('[data-testid="security-session"]').setValue(session.id)
  await confirm(w)
  await w.get('[data-testid="security-more-sessions"]').trigger('click')
  expect(rest.sessions).toHaveBeenLastCalledWith(detail.userId, {
    limit: 20,
    cursor: 'synthetic-cursor',
  })
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.revokeSession).not.toHaveBeenCalled()
  gate.resolve({
    ...sessions,
    items: [session, { ...session, id: 'synthetic-session-2', deviceLabel: 'Synthetic phone' }],
  })
  await flushPromises()
  expect(w.get('[data-testid="security-session"]').findAll('option')).toHaveLength(3)
  expect((w.get('[data-testid="security-confirm"]').element as HTMLInputElement).checked).toBe(
    false,
  )
  await w.get('[data-testid="security-session"]').setValue('synthetic-session-2')
  await confirm(w, 'Synthetic single-session review')
  expect(w.get('[data-testid="security-confirm-label"]').text()).toContain('synthetic-session-2')
  await w.get('[data-testid="security-form"]').trigger('submit')
  await flushPromises()
  expect(rest.revokeSession).toHaveBeenCalledExactlyOnceWith(detail.userId, 'synthetic-session-2', {
    expectedVersion: 7,
    note: 'Synthetic single-session review',
    confirmed: true,
  })
  rest.account.mockResolvedValue({ ...detail, version: 8 })
  rest.sessions.mockResolvedValue({ ...sessions, version: 8 })
  await w.get('[data-testid="security-reload"]').trigger('click')
  await flushPromises()
  await w.get('[data-testid="security-action"]').setValue('sessions')
  expect(w.text()).toContain('Ends all sessions for this account')
  await confirm(w, 'Synthetic all-session review')
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.revokeSessions).toHaveBeenCalledExactlyOnceWith(detail.userId, {
    expectedVersion: 8,
    note: 'Synthetic all-session review',
    confirmed: true,
  })
})
it('fences deferred session pages across target switches and rejects lower-version pagination', async () => {
  rest.sessions.mockResolvedValueOnce({ ...sessions, nextCursor: 'page-2' })
  const page = deferred<typeof sessions>()
  const w = await open()
  rest.sessions.mockReturnValueOnce(page.promise)
  await w.get('[data-testid="security-more-sessions"]').trigger('click')
  rest.account.mockResolvedValue({ ...detail, userId: 'synthetic-b', version: 10 })
  rest.sessions.mockResolvedValue({
    ...sessions,
    userId: 'synthetic-b',
    version: 10,
    items: [],
    nextCursor: 'b-next',
  })
  await w.setProps({ userId: 'synthetic-b', accountVersion: 10 })
  await flushPromises()
  page.resolve(sessions)
  await flushPromises()
  expect(w.text()).not.toContain(session.deviceLabel)
  rest.sessions.mockResolvedValueOnce({ ...sessions, userId: 'synthetic-b', version: 9 })
  await w.get('[data-testid="security-more-sessions"]').trigger('click')
  await flushPromises()
  expect(w.text()).not.toContain(session.deviceLabel)
})
it.each(['UNAUTHORIZED', 'FORBIDDEN'])(
  'clears all protected evidence after a current %s mutation denial',
  async (code) => {
    const w = await open()
    rest.suspend.mockRejectedValueOnce({ code })
    await confirm(w)
    await w.get('[data-testid="security-form"]').trigger('submit')
    await flushPromises()
    expect(w.emitted('denied')).toEqual([[code]])
    expect(w.find('[data-testid="security-form"]').exists()).toBe(false)
    expect(w.text()).not.toContain(session.deviceLabel)
    await w.get('[data-testid="security-reload"]').trigger('click')
    expect(rest.account).toHaveBeenCalledOnce()
  },
)
it('does not publish or reload a write that finishes after target switch or unmount', async () => {
  const gate = deferred<{ id: string; version: number; affectedSessionCount: number }>()
  rest.suspend.mockReturnValueOnce(gate.promise)
  const w = await open()
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  rest.account.mockResolvedValue({ ...detail, userId: 'synthetic-b' })
  rest.sessions.mockResolvedValue({ ...sessions, userId: 'synthetic-b' })
  await w.setProps({ userId: 'synthetic-b' })
  gate.resolve({ id: detail.userId, version: 8, affectedSessionCount: 1 })
  await flushPromises()
  expect(w.emitted('changed')).toBeUndefined()
  expect(w.text()).not.toContain('completed')
  expect(rest.account).toHaveBeenCalledOnce()
  await w.get('[data-testid="security-reload"]').trigger('click')
  await flushPromises()
  const gate2 = deferred<{ id: string; version: number; affectedSessionCount: number }>()
  rest.suspend.mockReturnValueOnce(gate2.promise)
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  w.unmount()
  gate2.resolve({ id: 'synthetic-b', version: 8, affectedSessionCount: 1 })
  await flushPromises()
  expect(w.emitted('changed')).toBeUndefined()
  expect(rest.account).toHaveBeenCalledTimes(2)
})
it('keeps uncertain identity locks across target switches and preserves retry notes when the evidence reload fails', async () => {
  const w = await open()
  rest.suspend.mockRejectedValueOnce(new Error('synthetic transport'))
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  await flushPromises()
  rest.account.mockRejectedValueOnce(new Error('synthetic read transport'))
  await w.get('[data-testid="security-reload"]').trigger('click')
  await flushPromises()
  await w.get('[data-testid="security-reload"]').trigger('click')
  await flushPromises()
  expect((w.get('[data-testid="security-note"]').element as HTMLTextAreaElement).value).toBe(
    'Synthetic security review',
  )
  rest.account.mockResolvedValue({ ...detail, userId: 'synthetic-b' })
  rest.sessions.mockResolvedValue({ ...sessions, userId: 'synthetic-b' })
  await w.setProps({ userId: 'synthetic-b' })
  await flushPromises()
  rest.account.mockResolvedValue(detail)
  rest.sessions.mockResolvedValue(sessions)
  await w.setProps({ userId: detail.userId })
  await flushPromises()
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).toHaveBeenCalledOnce()
})
it('retains completion notice when the parent synchronously advances revision and global busy', async () => {
  const w = await open()
  w.setProps({
    onBusy: (busy: boolean) => {
      void w.setProps({ disabled: busy })
    },
    onChanged: () => {
      void w.setProps({ revision: 1, accountVersion: 8 })
    },
  })
  rest.account.mockRejectedValueOnce(new Error('synthetic reload'))
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  await flushPromises()
  expect(w.text()).toContain('Security action completed.')
  expect(w.text()).toContain('Unable to load security data')
})
it('renders suspension timestamp and server reauthentication requirement without a parallel sign-in form', async () => {
  rest.account.mockResolvedValue({
    ...detail,
    state: 'SUSPENDED',
    suspendedAt: '2026-10-28T12:00:00.000Z',
  })
  rest.context.mockResolvedValue({
    ...context,
    reauthenticationRequired: true,
    freshLoginUntil: null,
  })
  const w = await open()
  expect(w.text()).toContain('Suspended at: 2026-10-28T12:00:00.000Z')
  expect(w.find('input[type="password"]').exists()).toBe(false)
  expect(w.text()).toContain('Fresh sign-in required')
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.reinstate).not.toHaveBeenCalled()
})
it('requires new confirmation when a pending refreshed page returns changed session evidence', async () => {
  const w = await open()
  await confirm(w)
  const gate = deferred<typeof sessions>()
  rest.sessions.mockReturnValueOnce(gate.promise)
  await w.setProps({ revision: 1 })
  await flushPromises()
  gate.resolve({ ...sessions, version: 8 })
  await flushPromises()
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).not.toHaveBeenCalled()
})
it('remembers parent high-water versions before reads complete and across target switches', async () => {
  const gate = deferred<typeof detail>()
  rest.account.mockReturnValueOnce(gate.promise)
  const w = await open({ accountVersion: 9 })
  rest.account.mockResolvedValue({ ...detail, userId: 'synthetic-b' })
  rest.sessions.mockResolvedValue({ ...sessions, userId: 'synthetic-b' })
  await w.setProps({ userId: 'synthetic-b', accountVersion: 7 })
  await flushPromises()
  gate.resolve(detail)
  await flushPromises()
  rest.account.mockResolvedValue(detail)
  rest.sessions.mockResolvedValue(sessions)
  await w.setProps({ userId: detail.userId })
  await flushPromises()
  await confirm(w)
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).not.toHaveBeenCalled()
  expect(w.text()).toContain('Version 9')
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
it('renders actual security state, verification and method availability without enrollment claims or HTML', async () => {
  const w = await open()
  expect(rest.account).toHaveBeenCalledExactlyOnceWith(detail.userId)
  expect(rest.sessions).toHaveBeenCalledExactlyOnceWith(detail.userId, { limit: 20 })
  expect(rest.context).toHaveBeenCalledOnce()
  expect(w.text()).toContain('ACTIVE')
  expect(w.text()).toContain('Email verified: No')
  expect(w.text()).toContain('Password configured: Yes')
  expect(w.text()).toContain('Google linked: No')
  expect(w.text()).toContain('Email OTP available: Yes')
  expect(w.text()).toContain(session.deviceLabel)
  expect(w.find('img').exists()).toBe(false)
  expect(w.text()).toContain(session.createdAt)
  expect(w.text()).not.toContain('token')
  expect(w.text()).toContain('Suspension is indefinite')
})

it('requires bounded reason and target/action confirmation, captures identity/version, and prevents pending duplicates', async () => {
  const gate = deferred<{ id: string; version: number; affectedSessionCount: number }>()
  rest.suspend.mockReturnValueOnce(gate.promise)
  const events: boolean[] = []
  const w = await open({ onBusy: (value: boolean) => events.push(value) })
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).not.toHaveBeenCalled()
  await confirm(w, 'x'.repeat(501))
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.suspend).not.toHaveBeenCalled()
  await confirm(w)
  expect(w.get('[data-testid="security-confirm-label"]').text()).toContain(
    'Suspend synthetic-target',
  )
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(events).toEqual([true])
  expect(rest.suspend).toHaveBeenCalledExactlyOnceWith(detail.userId, {
    expectedVersion: 7,
    note: 'Synthetic security review',
    confirmed: true,
  })
  await w.get('[data-testid="security-form"]').trigger('submit')
  w.get('[data-testid="security-reload"]').element.dispatchEvent(new Event('click'))
  expect(rest.suspend).toHaveBeenCalledOnce()
  expect(rest.account).toHaveBeenCalledOnce()
  rest.account.mockResolvedValue({
    ...detail,
    version: 8,
    state: 'SUSPENDED',
    suspendedAt: '2026-10-28T00:00:00.000Z',
  })
  rest.sessions.mockResolvedValue({ ...sessions, version: 8, items: [] })
  gate.resolve({ id: detail.userId, version: 8, affectedSessionCount: 1 })
  await flushPromises()
  expect(events).toEqual([true, false])
  expect(w.emitted('changed')).toEqual([[{ id: detail.userId, version: 8 }]])
  expect(w.text()).toContain('Security action completed. Sessions affected: 1.')
  expect(w.text()).toContain('SUSPENDED')
  expect((w.get('[data-testid="security-note"]').element as HTMLTextAreaElement).value).toBe('')
  expect((w.get('[data-testid="security-confirm"]').element as HTMLInputElement).checked).toBe(
    false,
  )
  expect(w.text()).toContain('new sign-in')
  await confirm(w, 'Synthetic reinstate')
  await w.get('[data-testid="security-form"]').trigger('submit')
  expect(rest.reinstate).toHaveBeenCalledExactlyOnceWith(detail.userId, {
    expectedVersion: 8,
    note: 'Synthetic reinstate',
    confirmed: true,
  })
})
