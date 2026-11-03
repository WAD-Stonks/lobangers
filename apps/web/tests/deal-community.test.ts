import type { CommunitySummary } from '@broke-oclock/contracts/community'
import { flushPromises, mount } from '@vue/test-utils'
import { useConfirm } from '@web/lib/use-confirm'
import DealCommunity from '@web/modules/community/DealCommunity.vue'
import { defined } from '@web-tests/support/defined'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  comments: vi.fn(),
  vote: vi.fn(),
  removeVote: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  editComment: vi.fn(),
  likeComment: vi.fn(),
  reportDeal: vi.fn(),
  reportComment: vi.fn(),
}))
const session = ref<{ data: { user: { id: string } } | null }>({ data: null })
vi.mock('@web/lib/auth-client', () => ({ authClient: { useSession: () => session } }))
vi.mock('@web/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/lib/api-client')>()),
  api: { community: mocks },
}))
const dealId = '000000000000000000000001'
const otherDeal = '000000000000000000000002'
const comment = {
  id: '000000000000000000000010',
  body: '<script>plain text</script>',
  authorName: 'Synthetic contributor',
  createdAt: '2026-10-22T00:00:00.000Z',
  canDelete: true,
}
const summary: CommunitySummary = {
  alive: 0,
  dead: 0,
  status: 'NO_RECENT_REPORTS',
  myVote: null,
  myVoteIsRecent: false,
  lastReportedAt: null,
  asOf: '2026-10-22T00:00:00.000Z',
  commentCount: 0,
  policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
}
const wrappers: { unmount: () => void }[] = []
const render = async (explanationPopup = false) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push(`/deals/${dealId}`)
  const wrapper = mount(DealCommunity, {
    props: { dealId, explanationPopup },
    global: { plugins: [router] },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  session.value = { data: null }
  mocks.summary.mockResolvedValue({ ...summary })
  mocks.comments.mockResolvedValue({ items: [], nextCursor: null })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => {
    wrapper.unmount()
  })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('community deal panel (synthetic API fixtures)', () => {
  it.each([false, true])(
    'opens deal reporting in a popup rather than inline (details dialog: %s)',
    async (explanationPopup) => {
      session.value = { data: { user: { id: 'synthetic-user' } } }
      const wrapper = await render(explanationPopup)
      const trigger = wrapper.get('.deal-community-report-link')
      expect(trigger.attributes('aria-haspopup')).toBe('dialog')
      await trigger.trigger('click')
      await flushPromises()
      expect(wrapper.get('.deal-community-report-dialog').element.tagName).toBe('DIALOG')
      expect(wrapper.get('.deal-community-report-dialog .deal-community-report h2').text()).toBe(
        'Report this deal',
      )
      expect(wrapper.find('.deal-community-overview .deal-community-report').exists()).toBe(false)
      await wrapper.get('[aria-label="Close report"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('.deal-community-report').exists()).toBe(false)
    },
  )

  it('shows brief inline vote feedback without reserving a separate notification row', async () => {
    vi.useFakeTimers()
    session.value = { data: { user: { id: 'synthetic-user' } } }
    mocks.vote.mockResolvedValue({
      ...summary,
      alive: 1,
      myVote: 'ALIVE',
      myVoteIsRecent: true,
      lastReportedAt: '2026-10-22T01:00:00.000Z',
    })
    mocks.removeVote.mockResolvedValue({
      ...summary,
      alive: 0,
      myVote: null,
      myVoteIsRecent: false,
    })
    const wrapper = await render()
    const help = wrapper.get('#deal-community-vote-help').element
    expect(wrapper.find('[data-testid="vote-receipt-slot"]').exists()).toBe(false)
    await wrapper.get('[data-testid="vote-alive"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('#deal-community-vote-help').element).toBe(help)
    expect(wrapper.get('#deal-community-vote-help').text()).toBe('Vote saved.')
    expect(wrapper.get('#deal-community-vote-help').classes()).toContain('vote-feedback--saved')
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('#deal-community-vote-help').text()).toContain('Your vote: Still on.')
    await wrapper.get('[data-testid="vote-alive"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('#deal-community-vote-help').text()).toBe('Vote removed.')
    expect(wrapper.get('#deal-community-vote-help').classes()).toContain('vote-feedback--removed')
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('#deal-community-vote-help').text()).toContain('Visited recently?')
  })

  it.each(['manual refresh', 'minute poll'])(
    'publishes changed shared evidence after %s',
    async (mode) => {
      vi.useFakeTimers()
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
      mocks.summary.mockResolvedValue({ ...summary, alive: 3, status: 'LIKELY_STILL_ON' })
      const wrapper = await render()
      const notifications = wrapper.emitted('updated')?.length ?? 0
      mocks.summary.mockResolvedValue({ ...summary, commentCount: 2 })
      if (mode === 'manual refresh')
        await wrapper.get('.deal-community-header button').trigger('click')
      else await vi.advanceTimersByTimeAsync(60_000)
      await flushPromises()
      expect(wrapper.get('.deal-community-status').text()).toBe('No recent reports')
      expect(wrapper.emitted('updated') ?? []).toHaveLength(notifications + 1)
    },
  )
  it('does not reload shared deals for unchanged public evidence', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const wrapper = await render()
    expect(wrapper.emitted('updated')).toHaveLength(1)
    mocks.summary.mockResolvedValue({ ...summary, asOf: '2026-10-22T00:01:00.000Z' })
    await vi.advanceTimersByTimeAsync(60000)
    await flushPromises()
    await wrapper.get('.deal-community-header button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('updated')).toHaveLength(1)
  })
  it('allows anonymous reading and explains the approved policy and deal-wide scope', async () => {
    const wrapper = await render()
    expect(wrapper.text()).toContain('3 positive voters and at least 80%')
    expect(wrapper.text()).toContain('across all outlets')
    expect(wrapper.get('a').attributes('href')).toContain('/login?redirect=')
    expect(wrapper.find('[data-testid="vote-alive"]').exists()).toBe(false)
  })
  it('rolls back optimistic voting after a failed request', async () => {
    session.value = { data: { user: { id: 'synthetic-user' } } }
    let reject: (error: Error) => void = () => {}
    mocks.vote.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise
        }),
    )
    const wrapper = await render()
    await wrapper.get('[data-testid="vote-alive"]').trigger('click')
    expect(wrapper.get('[data-testid="vote-alive"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="vote-alive"]').attributes('disabled')).toBeDefined()
    reject(new Error('Synthetic unavailable API'))
    await flushPromises()
    expect(wrapper.get('[data-testid="vote-alive"]').text()).toContain('0')
    expect(wrapper.get('[role="alert"]').text()).toContain('Please try again')
    expect(wrapper.emitted('updated')).toHaveLength(1)
  })
  it('lets an existing voter remove a vote and does not allow votes on expired deals', async () => {
    session.value = { data: { user: { id: 'synthetic-user' } } }
    mocks.summary.mockResolvedValue({ ...summary, alive: 1, myVote: 'ALIVE', myVoteIsRecent: true })
    mocks.removeVote.mockResolvedValue(summary)
    const wrapper = await render()
    await wrapper.get('[data-testid="vote-alive"]').trigger('click')
    await flushPromises()
    expect(mocks.removeVote).toHaveBeenCalledWith(dealId)
    expect(wrapper.emitted('updated')).toHaveLength(2)
    mocks.summary.mockResolvedValue({ ...summary, status: 'EXPIRED' })
    await wrapper.get('.deal-community-header button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="vote-alive"]').attributes('disabled')).toBeDefined()
  })
  it('preserves comment drafts on failure and clears them only after a successful post', async () => {
    session.value = { data: { user: { id: 'synthetic-user' } } }
    mocks.addComment
      .mockRejectedValueOnce(new Error('Synthetic failure'))
      .mockResolvedValueOnce(comment)
    const wrapper = await render()
    await wrapper.get('#deal-community-comment').setValue('My real observation')
    await wrapper.get('.deal-community-comment-form').trigger('submit')
    await flushPromises()
    expect((wrapper.get('#deal-community-comment').element as HTMLTextAreaElement).value).toBe(
      'My real observation',
    )
    await wrapper.get('.deal-community-comment-form').trigger('submit')
    await flushPromises()
    expect(mocks.addComment).toHaveBeenLastCalledWith(dealId, 'My real observation')
    expect((wrapper.get('#deal-community-comment').element as HTMLTextAreaElement).value).toBe('')
  })
  it('likes, replies to, and edits comments using persistent API actions', async () => {
    session.value = { data: { user: { id: 'synthetic-user' } } }
    mocks.comments.mockResolvedValue({
      items: [{ ...comment, liked: false, likeCount: 0 }],
      nextCursor: null,
    })
    mocks.likeComment.mockResolvedValue({ ok: true })
    mocks.editComment.mockResolvedValue({ ok: true })
    mocks.addComment.mockResolvedValue(comment)
    const wrapper = await render()
    const button = (text: string) =>
      defined(wrapper.findAll('button').find((b) => b.text() === text))
    await button('Like').trigger('click')
    await flushPromises()
    expect(mocks.likeComment).toHaveBeenCalledWith(comment.id, true)
    await button('Reply').trigger('click')
    await wrapper.get(`[id="reply-${comment.id}"]`).setValue('Thanks for the tip')
    await wrapper.get('.comment-card__form').trigger('submit')
    await flushPromises()
    expect(mocks.addComment).toHaveBeenCalledWith(dealId, 'Thanks for the tip', comment.id)
    await wrapper.get('[aria-label="Comment options"]').trigger('click')
    await button('Edit comment').trigger('click')
    await wrapper.get('[aria-label="Edit comment"]').setValue('Updated observation')
    await wrapper.get('.comment-card__form').trigger('submit')
    await flushPromises()
    expect(mocks.editComment).toHaveBeenCalledWith(comment.id, 'Updated observation')
  })

  it('asks in the app dialog, not the browser, before discarding a reply draft', async () => {
    session.value = { data: { user: { id: 'synthetic-user' } } }
    mocks.comments.mockResolvedValue({
      items: [{ ...comment, liked: false, likeCount: 0 }],
      nextCursor: null,
    })
    const nativeConfirm = vi.spyOn(window, 'confirm')
    const wrapper = await render()
    const button = (text: string) =>
      defined(wrapper.findAll('button').find((b) => b.text() === text))
    await button('Reply').trigger('click')
    await wrapper.get(`[id="reply-${comment.id}"]`).setValue('Half-written reply')

    await button('Cancel').trigger('click')
    await flushPromises()
    expect(useConfirm().current.value?.title).toBe('Discard draft?')
    useConfirm().cancel()
    await flushPromises()
    expect(wrapper.find(`[id="reply-${comment.id}"]`).exists()).toBe(true)

    await button('Cancel').trigger('click')
    await flushPromises()
    useConfirm().confirm()
    await flushPromises()
    expect(wrapper.find(`[id="reply-${comment.id}"]`).exists()).toBe(false)
    expect(nativeConfirm).not.toHaveBeenCalled()
    nativeConfirm.mockRestore()
  })

  it('renders comments as plain text, confirms own deletion and reports other comments', async () => {
    session.value = { data: { user: { id: 'synthetic-user' } } }
    mocks.comments.mockResolvedValue({
      items: [comment, { ...comment, id: '000000000000000000000011', canDelete: false }],
      nextCursor: null,
    })
    mocks.deleteComment.mockResolvedValue({ ok: true })
    mocks.reportComment.mockResolvedValue({ ok: true })
    const wrapper = await render()
    expect(wrapper.find('.deal-community-body script').exists()).toBe(false)
    expect(wrapper.get('.deal-community-body').text()).toBe('<script>plain text</script>')
    const byText = (text: string) =>
      wrapper.findAll('button').find((button) => button.text() === text)
    await defined(wrapper.findAll('[aria-label="Comment options"]')[0]).trigger('click')
    await byText('Delete comment')?.trigger('click')
    expect(mocks.deleteComment).not.toHaveBeenCalled()
    await byText('Confirm delete')?.trigger('click')
    await flushPromises()
    expect(mocks.deleteComment).toHaveBeenCalledWith(comment.id)
    await defined(wrapper.findAll('[aria-label="Comment options"]')[1]).trigger('click')
    await byText('Report comment')?.trigger('click')
    await wrapper.get('#deal-community-report-details').setValue('Synthetic report details')
    await wrapper.get('.deal-community-report').trigger('submit')
    await flushPromises()
    expect(mocks.reportComment).toHaveBeenCalledWith('000000000000000000000011', {
      reason: 'INAPPROPRIATE',
      details: 'Synthetic report details',
    })
    expect(wrapper.text()).toContain('Reports do not automatically hide content')
  })
  it('shows only three comments and opens a separate discussion on request', async () => {
    mocks.summary.mockResolvedValue({ ...summary, commentCount: 12 })
    mocks.comments.mockResolvedValue({
      items: Array.from({ length: 5 }, (_, index) => ({ ...comment, id: String(index) })),
      nextCursor: comment.id,
    })
    const wrapper = await render()
    expect(mocks.comments).toHaveBeenCalledWith(dealId, { limit: 3 })
    expect(wrapper.findAll('.deal-community-comments > li')).toHaveLength(3)
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('View all comments'))
      ?.trigger('click')
    expect(wrapper.emitted('view-change')).toEqual([[true]])
    expect(wrapper.text()).not.toContain('Load 5 more comments')
  })
  it('loads the dedicated view in batches of five without duplicating rows', async () => {
    mocks.comments
      .mockResolvedValueOnce({ items: [comment], nextCursor: comment.id })
      .mockResolvedValueOnce({ items: [comment], nextCursor: comment.id })
      .mockResolvedValueOnce({
        items: [comment, { ...comment, id: '000000000000000000000011' }],
        nextCursor: null,
      })
    const wrapper = await render()
    await wrapper.setProps({ allComments: true })
    await flushPromises()
    expect(mocks.comments).toHaveBeenLastCalledWith(dealId, { limit: 5 })
    expect(wrapper.find('.deal-community-verification').exists()).toBe(false)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Load 5 more comments')
      ?.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.deal-community-comments > li')).toHaveLength(2)
    expect(mocks.comments).toHaveBeenLastCalledWith(dealId, { cursor: comment.id, limit: 5 })
  })
  it('ignores a late response from a previously selected deal', async () => {
    let finish: (value: CommunitySummary) => void = () => {}
    mocks.summary
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce({ ...summary, alive: 7, status: 'LIKELY_STILL_ON' })
    const wrapper = await render()
    await wrapper.setProps({ dealId: otherDeal })
    await flushPromises()
    finish(summary)
    await flushPromises()
    expect(wrapper.get('.deal-community-status').text()).toBe('Likely still on')
    expect(wrapper.get('.deal-community-meta').text()).toContain('7 still on')
    expect(wrapper.emitted('updated')).toHaveLength(1)
  })
  it('ignores an older refresh failure after a successful vote', async () => {
    session.value = { data: { user: { id: 'synthetic-user' } } }
    const wrapper = await render()
    let fail: (error: Error) => void = () => {}
    mocks.summary.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    mocks.vote.mockResolvedValue({
      ...summary,
      alive: 3,
      myVote: 'ALIVE',
      myVoteIsRecent: true,
      status: 'LIKELY_STILL_ON',
    })
    await wrapper.get('.deal-community-header button').trigger('click')
    await wrapper.get('[data-testid="vote-alive"]').trigger('click')
    await flushPromises()
    fail(new Error('Superseded synthetic read failed'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('.deal-community-status').text()).toBe('Likely still on')
  })
})
