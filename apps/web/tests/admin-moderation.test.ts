import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

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
it('distinguishes a failed queue read from a confirmed empty result and offers retry', async () => {
  rest.reports.mockRejectedValueOnce(new Error('Synthetic read failure'))
  const c = await component()
  if (!c) return
  const w = mount(c)
  await flushPromises()
  expect(w.text()).toContain('Unable to load queue')
  expect(w.text()).toContain('Queue unavailable')
  expect(w.text()).not.toContain('Queue clear')
  expect(w.text()).not.toContain('0 loaded')
  rest.reports.mockResolvedValueOnce({ items: [], nextCursor: null })
  await w
    .findAll('button')
    .find((button) => button.text() === 'Retry queue')
    ?.trigger('click')
  await flushPromises()
  expect(w.text()).toContain('Queue clear')
  expect(w.text()).toContain('0 loaded')
  expect(w.text()).not.toContain('Queue unavailable')
  rest.reports.mockRejectedValueOnce(new Error('Synthetic filter read failure'))
  await w.get('#mod-type').setValue('DEAL')
  await flushPromises()
  expect(w.text()).toContain('Queue unavailable')
  expect(w.text()).not.toContain('Queue clear')
  expect(w.text()).not.toContain('0 loaded')
  w.unmount()
})
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

it('focuses selected evidence and clears consent when returning to the queue', async () => {
  const Panel = await component()
  if (!Panel) return
  const wrapper = mount(Panel, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.get('[data-testid="inspect-report"]').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="moderation-detail-heading"]').element,
    )
    expect(
      wrapper.find('.admin-record-workspace-detail [data-testid="decision-form"]').exists(),
    ).toBe(true)
    await wrapper.get('[name="note"]').setValue('Unsubmitted review')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('.admin-workspace-back').trigger('click')
    expect(wrapper.find('[name="note"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[data-testid="inspect-report"]').element)
    await wrapper.get('[data-testid="inspect-report"]').trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="confirmed"]').element.checked).toBe(false)
    expect(rest.resolve).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})

it('keeps a pending decision visible and cannot close it through Back to results', async () => {
  const Panel = await component()
  if (!Panel) return
  let release!: (value: typeof row) => void
  rest.resolve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const wrapper = mount(Panel)
  try {
    await flushPromises()
    await wrapper.get('[data-testid="inspect-report"]').trigger('click')
    await flushPromises()
    await wrapper.get('[name="note"]').setValue('Reviewed evidence')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('[data-testid="decision-form"]').trigger('submit')
    expect(wrapper.get('.admin-workspace-back').attributes('disabled')).toBeDefined()
    await wrapper.get('.admin-workspace-back').trigger('click')
    expect(wrapper.find('[data-testid="decision-form"]').exists()).toBe(true)
    expect(rest.resolve).toHaveBeenCalledTimes(1)
    release({ ...row, status: 'RESOLVED', moderationVersion: 5 })
    await flushPromises()
    expect(wrapper.get('.admin-workspace-back').attributes('disabled')).toBeUndefined()
  } finally {
    wrapper.unmount()
  }
})

const relatedDeal = {
  id: '2123456789abcdef01234567',
  title: 'Exact reported deal',
  deletedAt: null,
  publishedAt: '2026-01-01T00:00:00Z',
  reviewStatus: 'APPROVED',
  contentVersion: 3,
  reviewedVersion: 3,
  applicability: 'ALL_MERCHANT_OUTLETS',
}
const reportedComment = {
  id: row.targetId,
  dealId: relatedDeal.id,
  body: 'Exact reported comment',
  author: { id, name: 'Synthetic author' },
  createdAt: row.createdAt,
  deletedAt: null,
  hiddenAt: null,
  state: 'VISIBLE',
  moderationVersion: 11,
  deal: relatedDeal,
}
const routablePanel = async (path: string) => {
  const Panel = await component()
  if (!Panel) throw new Error('Moderation panel unavailable')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/moderation', component: Panel }],
  })
  await router.push(path)
  const wrapper = mount(Panel, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}
it('opens the exact report from its URL even outside the current queue and links its exact deal with return context', async () => {
  rest.reports.mockResolvedValue({ items: [], nextCursor: null })
  rest.report.mockResolvedValue({
    ...row,
    targetType: 'DEAL',
    targetId: relatedDeal.id,
    deal: relatedDeal,
  })
  const { wrapper } = await routablePanel(`/admin/moderation?reportId=${id}&collection=DEAL`)
  try {
    expect(rest.report).toHaveBeenCalledWith('DEAL', id)
    expect(wrapper.get('[data-testid="moderation-detail-heading"]').text()).toContain('report')
    const href = new URL(
      wrapper.get('[data-testid="open-reported-deal"]').attributes('href') ?? '',
      'http://example.test',
    )
    expect(href.pathname).toBe('/admin/deals')
    expect(href.searchParams.get('dealId')).toBe(relatedDeal.id)
    expect(href.searchParams.get('tab')).toBe('review')
    expect(href.searchParams.get('returnTo')).toBe(
      `/admin/moderation?reportId=${id}&collection=DEAL`,
    )
    expect(rest.resolve).not.toHaveBeenCalled()
    expect(rest.visibility).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
it('reads a reported comment afresh and keeps comment visibility separate from report resolution', async () => {
  const evidence = {
    ...row,
    deal: relatedDeal,
    comment: { ...reportedComment, moderationVersion: 2 },
  }
  rest.report.mockResolvedValue(evidence)
  rest.reports.mockResolvedValue({ items: [evidence], nextCursor: null })
  rest.comment.mockResolvedValue(reportedComment)
  rest.visibility.mockResolvedValue({
    ...reportedComment,
    state: 'HIDDEN',
    hiddenAt: row.createdAt,
    moderationVersion: 12,
  })
  const { wrapper, router } = await routablePanel(
    `/admin/moderation?reportId=${id}&collection=COMMENT`,
  )
  try {
    await wrapper.get('[name="note"]').setValue('Unsubmitted report decision')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('[data-testid="open-reported-comment"]').trigger('click')
    await flushPromises()
    expect(rest.comment).toHaveBeenCalledWith(row.targetId)
    expect(router.currentRoute.value.query).toMatchObject({
      commentId: row.targetId,
      reportId: id,
      collection: 'COMMENT',
    })
    expect(wrapper.get('[data-testid="moderation-detail-heading"]').text()).toBe('Review comment')
    expect(wrapper.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="confirmed"]').element.checked).toBe(false)
    expect(rest.visibility).not.toHaveBeenCalled()
    expect(rest.resolve).not.toHaveBeenCalled()
    await wrapper.get('[name="note"]').setValue('Reviewed the current comment')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('[data-testid="decision-form"]').trigger('submit')
    await flushPromises()
    expect(rest.visibility).toHaveBeenCalledWith(row.targetId, {
      expectedVersion: 11,
      visibility: 'HIDDEN',
      note: 'Reviewed the current comment',
      confirmed: true,
    })
    expect(rest.resolve).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="back-to-report"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.commentId).toBeUndefined()
    expect(rest.report).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="moderation-detail-heading"]').text()).toContain('report')
    expect(wrapper.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="confirmed"]').element.checked).toBe(false)
    expect(rest.resolve).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
it('queues a route target change until a captured report mutation settles, without transferring confirmation', async () => {
  rest.comment.mockResolvedValue(reportedComment)
  let release!: (value: typeof row) => void
  rest.resolve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const { wrapper, router } = await routablePanel(
    `/admin/moderation?reportId=${id}&collection=COMMENT`,
  )
  try {
    await wrapper.get('[name="note"]').setValue('Reviewed report')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('[data-testid="decision-form"]').trigger('submit')
    await router.push(`/admin/moderation?commentId=${row.targetId}`)
    await flushPromises()
    expect(rest.comment).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="moderation-detail-heading"]').text()).toContain('report')
    expect(wrapper.get('[data-testid="decision-form"]').text()).toContain('Saving')
    release({ ...row, status: 'RESOLVED', moderationVersion: 5 })
    await flushPromises()
    expect(rest.resolve).toHaveBeenCalledTimes(1)
    expect(rest.comment).toHaveBeenCalledWith(row.targetId)
    expect(wrapper.get('[data-testid="moderation-detail-heading"]').text()).toBe('Review comment')
    expect(wrapper.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="confirmed"]').element.checked).toBe(false)
    expect(rest.visibility).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
it('closes protected linked evidence when the fresh comment read is forbidden', async () => {
  rest.comment.mockRejectedValue({ code: 'FORBIDDEN' })
  const { wrapper } = await routablePanel(
    `/admin/moderation?commentId=${row.targetId}&reportId=${id}&collection=COMMENT`,
  )
  try {
    expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
    expect(wrapper.find('[data-testid="decision-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="open-reported-deal"]').exists()).toBe(false)
    expect(rest.resolve).not.toHaveBeenCalled()
    expect(rest.visibility).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
it.each([
  '/admin/moderation?reportId=invalid&collection=COMMENT',
  `/admin/moderation?reportId=${id}&collection=INVALID`,
  '/admin/moderation?commentId=invalid',
])('ignores invalid record route parameters without attempting a detail read: %s', async (path) => {
  const { wrapper } = await routablePanel(path)
  try {
    expect(rest.report).not.toHaveBeenCalled()
    expect(rest.comment).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="decision-form"]').exists()).toBe(false)
    expect(rest.resolve).not.toHaveBeenCalled()
    expect(rest.visibility).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
