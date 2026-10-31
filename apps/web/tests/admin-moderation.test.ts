import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const rest = vi.hoisted(() => ({
  reports: vi.fn(),
  report: vi.fn(),
  resolve: vi.fn(),
  comments: vi.fn(),
  comment: vi.fn(),
  visibility: vi.fn(),
  session: vi.fn(),
  methods: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  api: { adminModeration: rest, infrastructure: { authMethods: rest.methods } },
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    getSession: rest.session,
    useSession: () => ({ value: { refetch: async () => {} } }),
    signOut: vi.fn(),
  },
}))
const id = '0123456789abcdef01234567'
const row = {
  id,
  targetType: 'COMMENT',
  targetId: '1123456789abcdef01234567',
  moderationVersion: 4,
  reason: 'SPAM',
  status: 'OPEN',
  details: 'Original evidence',
  reporter: { id, name: 'Private reporter' },
  deal: null,
  comment: null,
  resolution: null,
  resolvedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
}
beforeEach(() => {
  vi.resetAllMocks()
  rest.reports.mockResolvedValue({ items: [row], nextCursor: null })
  rest.report.mockResolvedValue(row)
  rest.comments.mockResolvedValue({ items: [], nextCursor: null })
  rest.session.mockResolvedValue({
    data: { user: { id, name: 'Synthetic admin' }, session: { id: 'synthetic-session' } },
    error: null,
  })
  rest.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: false,
    passwordRecovery: false,
  })
})
const component = async () => {
  const m = await import('@web/modules/admin-moderation/ModerationPanel.vue').catch(() => null)
  expect(m, 'moderation panel exists').not.toBeNull()
  return m?.default
}
it('mounts queue and submits exact selected collection/id/version only once with deliberate confirmation', async () => {
  const c = await component()
  if (!c) return
  const w = mount(c)
  await flushPromises()
  await w.get('[data-testid="inspect-report"]').trigger('click')
  await flushPromises()
  await w.get('[name="note"]').setValue('Reviewed evidence')
  await w.get('[name="confirmed"]').setValue(true)
  let release!: (x: unknown) => void
  rest.resolve.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r
      }),
  )
  await w.get('form[data-testid="decision-form"]').trigger('submit')
  await w.get('form[data-testid="decision-form"]').trigger('submit')
  expect(rest.resolve).toHaveBeenCalledTimes(1)
  expect(rest.resolve).toHaveBeenCalledWith('COMMENT', id, {
    expectedVersion: 4,
    decision: 'RESOLVED',
    resolution: 'Reviewed evidence',
    confirmed: true,
  })
  release({ ...row, status: 'RESOLVED', moderationVersion: 5 })
  await flushPromises()
  expect(w.text()).toContain(
    'Report resolved. Content visibility and sibling reports were not changed.',
  )
  w.unmount()
})
it('locks uncertain result across same-version reads and target switches without replay', async () => {
  const c = await component()
  if (!c) return
  const w = mount(c)
  await flushPromises()
  await w.get('[data-testid="inspect-report"]').trigger('click')
  await flushPromises()
  rest.resolve.mockRejectedValueOnce(new Error('Synthetic transport timeout'))
  await w.get('[name="note"]').setValue('Review')
  await w.get('[name="confirmed"]').setValue(true)
  await w.get('form[data-testid="decision-form"]').trigger('submit')
  await flushPromises()
  await w.get('[data-testid="refresh-detail"]').trigger('click')
  await flushPromises()
  await w.get('[name="note"]').setValue('Again')
  await w.get('[name="confirmed"]').setValue(true)
  await w.get('form[data-testid="decision-form"]').trigger('submit')
  await flushPromises()
  await w.get('#mod-type').setValue('DEAL')
  await flushPromises()
  await w.get('#mod-type').setValue('COMMENT')
  await flushPromises()
  await w.get('[data-testid="inspect-report"]').trigger('click')
  await flushPromises()
  await w.get('[name="note"]').setValue('No replay')
  await w.get('[name="confirmed"]').setValue(true)
  await w.get('form[data-testid="decision-form"]').trigger('submit')
  await flushPromises()
  expect(rest.resolve).toHaveBeenCalledTimes(1)
  expect(w.text()).toContain('Outcome is unknown')
  w.unmount()
})

it('mounts session controls and closes protected evidence on absent native identity', async () => {
  const Page = (await import('@web/pages/AdminModerationPage.vue')).default
  const w = mount(Page)
  await flushPromises()
  expect(w.get('h1').text()).toBe('Reports & comment moderation')
  expect(w.text()).toContain('Report queue')
  w.unmount()
  rest.session.mockResolvedValue({ data: null, error: null })
  const anonymous = mount(Page)
  await flushPromises()
  expect(anonymous.text()).toContain('Sign in to moderate')
  expect(anonymous.find('[name="note"]').exists()).toBe(false)
  anonymous.unmount()
})

it('drops late detail after queue changes and clears protected evidence on permission denial', async () => {
  const c = await component()
  if (!c) return
  const w = mount(c)
  await flushPromises()
  let release!: (v: unknown) => void
  rest.report.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r
      }),
  )
  await w.get('[data-testid="inspect-report"]').trigger('click')
  await flushPromises()
  await w.get('#mod-type').setValue('DEAL')
  await flushPromises()
  release(row)
  await flushPromises()
  expect(w.find('[name="note"]').exists()).toBe(false)
  rest.reports.mockRejectedValueOnce({ code: 'FORBIDDEN' })
  await w.get('form.row').trigger('submit')
  await flushPromises()
  expect(w.emitted('denied')).toEqual([['FORBIDDEN']])
  expect(w.find('[data-testid="inspect-report"]').exists()).toBe(false)
  w.unmount()
})
it('reauthorizes a refused mutation without replay and retains operation-specific refusal when read remains allowed', async () => {
  const c = await component()
  if (!c) return
  const w = mount(c)
  await flushPromises()
  await w.get('[data-testid="inspect-report"]').trigger('click')
  await flushPromises()
  rest.resolve.mockRejectedValueOnce({ code: 'FORBIDDEN' })
  await w.get('[name="note"]').setValue('Review')
  await w.get('[name="confirmed"]').setValue(true)
  await w.get('form[data-testid="decision-form"]').trigger('submit')
  await flushPromises()
  expect(rest.reports).toHaveBeenLastCalledWith({ targetType: 'COMMENT', limit: 1 })
  expect(rest.resolve).toHaveBeenCalledTimes(1)
  expect(w.emitted('denied')).toBeUndefined()
  expect(w.text()).toContain('This operation was refused.')
  expect(w.find('[name="note"]').exists()).toBe(false)
  w.unmount()
})

it('retains mounted CONFLICT lock for exact collection/type/id until newer moderation detail', async () => {
  const Panel = await component()
  if (!Panel) return
  rest.reports.mockImplementation(async (q) => ({
    items: [{ ...row, targetType: q.targetType }],
    nextCursor: null,
  }))
  rest.report.mockImplementation(async (targetType) => ({ ...row, targetType }))
  rest.resolve.mockRejectedValue({ code: 'CONFLICT' })
  const w = mount(Panel)
  const inspect = async () => {
    await w.get('[data-testid="inspect-report"]').trigger('click')
    await flushPromises()
  }
  const submit = async () => {
    await w.get('[name="note"]').setValue('Reviewed')
    await w.get('[name="confirmed"]').setValue(true)
    await w.get('[data-testid="decision-form"]').trigger('submit')
    await flushPromises()
  }
  try {
    await flushPromises()
    await inspect()
    await submit()
    await w.get('[data-testid="refresh-detail"]').trigger('click')
    await flushPromises()
    await submit()
    expect(rest.resolve, 'same-version conflict must not redispatch').toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('Evidence changed')
    await w.get('#mod-type').setValue('DEAL')
    await flushPromises()
    await inspect()
    expect(w.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    await submit()
    expect(rest.resolve).toHaveBeenCalledTimes(2)
    expect(rest.resolve.mock.calls[1]?.slice(0, 2)).toEqual(['DEAL', id])
    await w.get('#mod-type').setValue('COMMENT')
    await flushPromises()
    await inspect()
    await submit()
    expect(rest.resolve).toHaveBeenCalledTimes(2)
    rest.report.mockResolvedValue({ ...row, moderationVersion: 5 })
    await w.get('[data-testid="refresh-detail"]').trigger('click')
    await flushPromises()
    expect(w.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    await submit()
    expect(rest.resolve).toHaveBeenCalledTimes(3)
    expect(rest.resolve.mock.calls[2]?.[2].expectedVersion).toBe(5)
  } finally {
    w.unmount()
  }
})
