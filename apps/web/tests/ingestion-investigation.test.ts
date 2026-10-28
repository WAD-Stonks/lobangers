import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import DraftQueue from '@web/modules/ingestion-admin/DraftQueue.vue'
import FailedPosts from '@web/modules/ingestion-admin/FailedPosts.vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const calls = vi.hoisted(() => ({
  drafts: vi.fn(),
  evidence: vi.fn(),
  citation: vi.fn(),
  posts: vi.fn(),
  post: vi.fn(),
  recover: vi.fn(),
  recovery: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  api: { ingestion: { drafts: calls.drafts }, ingestionInvestigation: calls },
}))
const draft = {
  id: '0123456789abcdef01234567',
  title: 'Synthetic numeric deal',
  description: '<script>unsafe()</script>',
  terms: null,
  category: 'other',
  offerType: 'FIXED_PRICE',
  priceMinor: 1250,
  currency: 'SGD',
  discountPercent: null,
  validFrom: null,
  validUntil: null,
  rawValidityText: null,
  applicability: 'ONLINE',
  merchantId: null,
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 1,
  sourceUrl: 'https://example.test',
  sourceName: 'Synthetic',
  reviewNote: null,
  reviewReady: false,
}
beforeEach(() => {
  vi.resetAllMocks()
  calls.drafts.mockResolvedValue({ items: [draft], nextCursor: null })
  calls.evidence.mockResolvedValue({ items: [], nextCursor: null })
})
it('shows full numeric terms in both queue and detail and mounts immutable evidence without HTML execution', async () => {
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  await flushPromises()
  expect(wrapper.text()).toContain('1250 minor units')
  expect(wrapper.text()).toContain('SGD')
  await wrapper.get(`[data-testid="view-${draft.id}"]`).trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Immutable source evidence')
  expect(wrapper.text()).toContain('<script>unsafe()</script>')
  expect(wrapper.find('script').exists()).toBe(false)
  expect(calls.evidence).toHaveBeenCalledWith(draft.id, { limit: 20 })
  wrapper.unmount()
})

const postId = '0123456789abcdef01234568'
const detail = () => ({
  post: {
    id: postId,
    externalId: '123',
    source: {
      id: '0123456789abcdef01234569',
      name: '<img src=x onerror=alert(1)> Source',
      provider: 'WORDPRESS',
      externalId: 'moneydigest.sg',
      url: 'https://www.moneydigest.sg/',
      enabled: true,
    },
    status: 'FAILED',
    errorCode: 'INGESTION_FAILED',
    failureStage: 'MEDIA',
    contentHash: 'a'.repeat(64),
    latestSnapshotHash: 'b'.repeat(64),
    snapshotFormat: 'moneydigest-v1',
    updatedAt: '2026-10-28T01:00:00.000Z',
    fetchedAt: '2026-10-28T01:00:00.000Z',
    processedAt: null,
    snapshotAvailable: true,
    url: 'https://www.moneydigest.sg/synthetic/',
    title: 'Synthetic',
  },
  citations: [],
  nextCitationCursor: null,
  capabilities: [
    { mode: 'REPROCESS_STORED', allowed: true, blockers: [] },
    { mode: 'REFRESH_SOURCE_WINDOW', allowed: true, blockers: [] },
  ],
  latestRecovery: null,
})
const consent = async (wrapper: Pick<ReturnType<typeof mount>, 'get'>) => {
  await wrapper.get('textarea').setValue('Synthetic explicitly reviewed reason')
  await wrapper.get('input[type="checkbox"]').setValue(false)
  await wrapper.get('input[type="checkbox"]').setValue(true)
}
it('submits captured target hash/time once, distinguishes operation vs target outcome, and requires a fresh read', async () => {
  const { default: PostInvestigation } = await import(
    '@web/modules/ingestion-admin/PostInvestigation.vue'
  )
  calls.post.mockResolvedValue(detail())
  let complete!: (v: unknown) => void
  calls.recover.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const wrapper = mount(PostInvestigation, { props: { postId } })
  await flushPromises()
  await consent(wrapper)
  await wrapper.get('form').trigger('submit')
  await wrapper.get('form').trigger('submit')
  expect(calls.recover).toHaveBeenCalledTimes(1)
  expect(calls.recover).toHaveBeenCalledWith(postId, {
    expectedUpdatedAt: detail().post.updatedAt,
    expectedContentHash: detail().post.contentHash,
    mode: 'REPROCESS_STORED',
    note: 'Synthetic explicitly reviewed reason',
    confirmed: true,
  })
  complete({
    id: '0123456789abcdef01234570',
    postId,
    status: 'SUCCEEDED',
    targetOutcome: 'NOT_OBSERVED',
    errorCode: null,
  })
  await flushPromises()
  expect(wrapper.text()).toContain('operation SUCCEEDED; target outcome NOT_OBSERVED')
  expect(wrapper.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
  expect(wrapper.find('img').exists()).toBe(false)
  wrapper.unmount()
})
it('keeps ambiguous attempts locked across reload and never automatically replays a mutation', async () => {
  const { default: PostInvestigation } = await import(
    '@web/modules/ingestion-admin/PostInvestigation.vue'
  )
  calls.post.mockResolvedValue(detail())
  calls.recover.mockRejectedValue(new Error('Synthetic connection lost'))
  const wrapper = mount(PostInvestigation, { props: { postId } })
  await flushPromises()
  await consent(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Recovery result must be reconciled')
  expect(wrapper.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
  expect(calls.recover).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('clears a known stale conflict only through a fresh read and requires a new reason', async () => {
  const { default: PostInvestigation } = await import(
    '@web/modules/ingestion-admin/PostInvestigation.vue'
  )
  calls.post.mockResolvedValue(detail())
  calls.recover.mockRejectedValue(new ApiClientError('CONFLICT', 409, 'Synthetic conflict'))
  const wrapper = mount(PostInvestigation, { props: { postId } })
  await flushPromises()
  await consent(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  calls.post.mockResolvedValue({
    ...detail(),
    post: { ...detail().post, updatedAt: '2026-10-28T02:00:00.000Z' },
  })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  await consent(wrapper)
  expect(wrapper.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
  wrapper.unmount()
})
it('ignores delayed evidence from a previously selected post and clears protected state on denial', async () => {
  const { default: PostInvestigation } = await import(
    '@web/modules/ingestion-admin/PostInvestigation.vue'
  )
  let late!: (v: unknown) => void
  calls.post
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve
        }),
    )
    .mockResolvedValueOnce({
      ...detail(),
      post: { ...detail().post, id: '0123456789abcdef01234571' },
    })
  const wrapper = mount(PostInvestigation, { props: { postId } })
  await flushPromises()
  await wrapper.setProps({ postId: '0123456789abcdef01234571' })
  await flushPromises()
  late(detail())
  await flushPromises()
  expect(wrapper.text()).not.toContain(`Post ${postId}`)
  calls.post.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Synthetic denied'))
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
  expect(wrapper.find('textarea').exists()).toBe(false)
  wrapper.unmount()
})

const recovery = (fields: Record<string, unknown> = {}) => ({
  id: '0123456789abcdef01234570',
  postId,
  sourceId: detail().post.source.id,
  mode: 'REPROCESS_STORED',
  expectedUpdatedAt: detail().post.updatedAt,
  expectedContentHash: detail().post.contentHash,
  note: 'Synthetic durable attempt',
  status: 'RUNNING',
  targetOutcome: 'UNKNOWN',
  runId: null,
  errorCode: null,
  requestedAt: '2026-10-28T01:01:00.000Z',
  finishedAt: null,
  ...fields,
})
const clickText = async (w: ReturnType<typeof mount>, text: string) => {
  const button = w.findAll('button').find((b) => b.text() === text)
  expect(button, text).toBeDefined()
  if (!button) throw new Error(`Missing button: ${text}`)
  await button.trigger('click')
  await flushPromises()
}
it('retains unknown attempt through original FailedPosts filter unmount and reconciles exact terminal plus fresh target', async () => {
  calls.posts.mockResolvedValue({ items: [detail().post], nextCursor: null })
  calls.post.mockResolvedValue(detail())
  calls.recover.mockRejectedValue(new Error('Synthetic lost response'))
  const w = mount(FailedPosts)
  try {
    await flushPromises()
    await clickText(w, 'Investigate 123')
    await consent(w)
    await w.get('section[aria-label="Post investigation"] form').trigger('submit')
    await flushPromises()
    await w.get('select').setValue('NEW')
    await flushPromises()
    expect(w.find('section[aria-label="Post investigation"]').exists()).toBe(false)
    await w.get('select').setValue('FAILED')
    await w.get('form').trigger('submit')
    await flushPromises()
    await clickText(w, 'Investigate 123')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await w.get('section[aria-label="Post investigation"] form').trigger('submit')
    await flushPromises()
    expect(calls.recover).toHaveBeenCalledTimes(1)
    calls.post.mockResolvedValue({ ...detail(), latestRecovery: recovery() })
    await clickText(w, 'Reload captured post evidence')
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    calls.post.mockResolvedValue({
      ...detail(),
      latestRecovery: recovery({
        status: 'SUCCEEDED',
        targetOutcome: 'UNCHANGED',
        finishedAt: '2026-10-28T01:02:00.000Z',
      }),
    })
    await clickText(w, 'Reload captured post evidence')
    expect(w.get('textarea').element.value).toBe('')
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await clickText(w, 'Reload captured post evidence')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})

it.each(['REQUESTED', 'RUNNING', 'INTERRUPTED'])(
  'reconstructs durable %s/UNKNOWN on a new mount without consent carryover or replay',
  async (status) => {
    const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
      .default
    calls.post.mockResolvedValue({ ...detail(), latestRecovery: recovery({ status }) })
    const w = mount(PostInvestigation, { props: { postId } })
    try {
      await flushPromises()
      await consent(w)
      expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
      await w.get('form').trigger('submit')
      await flushPromises()
      expect(calls.recover).not.toHaveBeenCalled()
      expect(w.text()).toContain('Recovery result must be reconciled')
      calls.post.mockResolvedValue({
        ...detail(),
        latestRecovery: recovery({ status: 'INTERRUPTED', targetOutcome: 'UNKNOWN' }),
      })
      await clickText(w, 'Reload captured post evidence')
      await consent(w)
      expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
      expect(w.text()).toContain('operation INTERRUPTED; target outcome UNKNOWN')
      calls.post.mockResolvedValue({
        ...detail(),
        latestRecovery: recovery({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED' }),
      })
      await clickText(w, 'Reload captured post evidence')
      expect(w.get('textarea').element.value).toBe('')
      expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
      await clickText(w, 'Reload captured post evidence')
      await consent(w)
      expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
      expect(calls.recover).not.toHaveBeenCalled()
    } finally {
      w.unmount()
    }
  },
)

it('reconciles only the exact captured recovery ID and requires a subsequent fresh post read', async () => {
  const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
    .default
  calls.post.mockResolvedValue(detail())
  calls.recover.mockResolvedValue(recovery())
  const w = mount(PostInvestigation, { props: { postId } })
  try {
    await flushPromises()
    await consent(w)
    await w.get('form').trigger('submit')
    await flushPromises()
    const read = async (value: unknown) => {
      calls.recovery.mockResolvedValue(value)
      await w.get('input[maxlength="24"]').setValue(recovery().id)
      await w.get('form:has(input[maxlength="24"])').trigger('submit')
      await flushPromises()
    }
    for (const wrong of [
      { id: '0123456789abcdef01234571' },
      { expectedContentHash: 'c'.repeat(64) },
      { expectedUpdatedAt: '2026-10-28T00:00:00.000Z' },
      { mode: 'REFRESH_SOURCE_WINDOW' },
    ]) {
      await read(recovery({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED', ...wrong }))
      await clickText(w, 'Reload captured post evidence')
      await consent(w)
      expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    }
    await read(recovery({ status: 'INTERRUPTED', targetOutcome: 'UNKNOWN' }))
    await clickText(w, 'Reload captured post evidence')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await read(recovery({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED' }))
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    calls.post.mockResolvedValue({
      ...detail(),
      post: { ...detail().post, updatedAt: '2026-10-28T00:00:00.000Z' },
    })
    await clickText(w, 'Reload captured post evidence')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    calls.post.mockResolvedValue(detail())
    await clickText(w, 'Reload captured post evidence')
    expect(w.get('textarea').element.value).toBe('')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})

it('keeps recovery locks through original DraftQueue selection/filter and keyed remount in one workspace', async () => {
  calls.posts.mockResolvedValue({ items: [], nextCursor: null })
  calls.evidence.mockResolvedValue({
    items: [{ id: '0123456789abcdef01234572', postId, source: detail().post.source }],
    nextCursor: null,
  })
  calls.post.mockResolvedValue(detail())
  calls.recover.mockRejectedValue(new Error('Synthetic unknown'))
  const Workspace = defineComponent({
    components: { FailedPosts, DraftQueue },
    setup: () => ({ revision: ref(0), protectedOpen: ref(true) }),
    template:
      '<div><button data-testid="replace" @click="revision++">Replace queue</button><button data-testid="close" @click="protectedOpen = !protectedOpen">Toggle access</button><template v-if="protectedOpen"><FailedPosts/><DraftQueue :key="revision" :revision="0"/></template></div>',
  })
  const w = mount(Workspace)
  const investigate = async () => {
    await w.get(`[data-testid="view-${draft.id}"]`).trigger('click')
    await flushPromises()
    await clickText(w, 'Investigate post')
  }
  const postPanel = () => w.get('section[aria-label="Post investigation"]')
  try {
    await flushPromises()
    await investigate()
    await consent(postPanel())
    await postPanel().get('form').trigger('submit')
    await flushPromises()
    await w.get('#queue-status').setValue('APPROVED')
    await flushPromises()
    expect(w.find('section[aria-label="Post investigation"]').exists()).toBe(false)
    await w.get('#queue-status').setValue('PENDING')
    await flushPromises()
    await investigate()
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await w.get('[data-testid="replace"]').trigger('click')
    await flushPromises()
    await investigate()
    expect(postPanel().get('textarea').element.value).toBe('')
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await postPanel().get('form').trigger('submit')
    await flushPromises()
    expect(calls.recover).toHaveBeenCalledTimes(1)
    // Session/access closure removes every protected owner. A later identity gets
    // no in-memory attempt or protected form; durable reads remain authoritative.
    await w.get('[data-testid="close"]').trigger('click')
    await flushPromises()
    await w.get('[data-testid="close"]').trigger('click')
    await flushPromises()
    await investigate()
    await consent(postPanel())
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})
it('does not let a late recovery response after access denial attach to a new workspace attempt', async () => {
  calls.posts.mockResolvedValue({ items: [detail().post], nextCursor: null })
  calls.post.mockResolvedValue(detail())
  let finish!: (value: unknown) => void
  calls.recover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const w = mount(FailedPosts)
  try {
    await flushPromises()
    await clickText(w, 'Investigate 123')
    await consent(w)
    await w.get('section[aria-label="Post investigation"] form').trigger('submit')
    await w.get('select').setValue('NEW')
    await flushPromises()
    calls.posts.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Synthetic revoked'))
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('denied')).toEqual([['FORBIDDEN']])
    expect(w.find('textarea').exists()).toBe(false)
    finish(recovery({ status: 'SUCCEEDED', targetOutcome: 'RECOVERED' }))
    await flushPromises()
    expect(w.find('textarea').exists()).toBe(false)
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})

it('never lets changed stale evidence discard a durable unresolved recovery', async () => {
  const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
    .default
  calls.post.mockResolvedValue(detail())
  calls.recover.mockRejectedValue(new ApiClientError('CONFLICT', 409, 'Synthetic stale request'))
  const w = mount(PostInvestigation, { props: { postId } })
  try {
    await flushPromises()
    await consent(w)
    await w.get('form').trigger('submit')
    await flushPromises()
    calls.post.mockResolvedValue({
      ...detail(),
      post: { ...detail().post, updatedAt: '2026-10-28T02:00:00.000Z' },
      latestRecovery: recovery(),
    })
    await clickText(w, 'Reload captured post evidence')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})

it('requires a post read started after the exact terminal receipt even across mounted panels', async () => {
  const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
    .default
  calls.post.mockResolvedValue(detail())
  calls.recover.mockResolvedValue(recovery())
  calls.recovery.mockResolvedValue(recovery({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED' }))
  const Workspace = defineComponent({
    components: { PostInvestigation },
    setup: () => ({ postId }),
    template:
      '<div><PostInvestigation :post-id="postId"/><PostInvestigation :post-id="postId"/></div>',
  })
  const w = mount(Workspace)
  try {
    await flushPromises()
    const first = w.findAllComponents(PostInvestigation)[0]
    const second = w.findAllComponents(PostInvestigation)[1]
    if (!first || !second) throw new Error('Both original investigation panels must mount')
    await consent(first)
    await first.get('form').trigger('submit')
    await flushPromises()
    let finish!: (value: unknown) => void
    calls.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await second.get('button').trigger('click')
    await first.get('input[maxlength="24"]').setValue(recovery().id)
    await first.get('form:has(input[maxlength="24"])').trigger('submit')
    await flushPromises()
    finish(detail())
    await flushPromises()
    await consent(second)
    expect(second.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    calls.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await second.get('button').trigger('click')
    await first.get('form:has(input[maxlength="24"])').trigger('submit')
    await flushPromises()
    finish(detail())
    await flushPromises()
    await consent(second)
    expect(second.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})

it('invalidates sibling-panel consent and stale captured detail when a shared attempt is reconciled', async () => {
  const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
    .default
  calls.post.mockResolvedValue(detail())
  calls.recover.mockResolvedValue(recovery())
  const Workspace = defineComponent({
    components: { PostInvestigation },
    setup: () => ({ postId }),
    template:
      '<div><PostInvestigation :post-id="postId"/><PostInvestigation :post-id="postId"/></div>',
  })
  const w = mount(Workspace)
  try {
    await flushPromises()
    const [first, second] = w.findAllComponents(PostInvestigation)
    if (!first || !second) throw new Error('Both original panels must mount')
    await consent(second)
    await consent(first)
    await first.get('form').trigger('submit')
    await flushPromises()
    calls.post.mockResolvedValue({
      ...detail(),
      post: { ...detail().post, updatedAt: '2026-10-28T02:00:00.000Z' },
      latestRecovery: recovery({ status: 'SUCCEEDED', targetOutcome: 'RECOVERED' }),
    })
    await first.get('button').trigger('click')
    await flushPromises()
    expect(second.get('textarea').element.value).toBe('')
    await consent(second)
    expect(second.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await second.get('form').trigger('submit')
    await flushPromises()
    expect(calls.recover).toHaveBeenCalledTimes(1)
    await second.get('button').trigger('click')
    await flushPromises()
    await consent(second)
    expect(second.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
  } finally {
    w.unmount()
  }
})

it('does not bind a late superseded write receipt to a newer attempt for the same post', async () => {
  const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
    .default
  calls.post.mockResolvedValue(detail())
  let finish!: (value: unknown) => void
  calls.recover
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockRejectedValueOnce(new Error('Synthetic second response lost'))
  const w = mount(PostInvestigation, { props: { postId } })
  try {
    await flushPromises()
    await consent(w)
    await w.get('form').trigger('submit')
    calls.post.mockResolvedValueOnce({
      ...detail(),
      post: { ...detail().post, id: '0123456789abcdef01234571' },
    })
    await w.setProps({ postId: '0123456789abcdef01234571' })
    await flushPromises()
    calls.post.mockResolvedValue({
      ...detail(),
      latestRecovery: recovery({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED' }),
    })
    await w.setProps({ postId })
    await flushPromises()
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await clickText(w, 'Reload captured post evidence')
    await consent(w)
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(calls.recover).toHaveBeenCalledTimes(2)
    finish(recovery({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED' }))
    await flushPromises()
    calls.post.mockResolvedValue({
      ...detail(),
      latestRecovery: recovery({
        id: '0123456789abcdef01234573',
        status: 'SUCCEEDED',
        targetOutcome: 'UNCHANGED',
      }),
    })
    await clickText(w, 'Reload captured post evidence')
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await clickText(w, 'Reload captured post evidence')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
    expect(calls.recover).toHaveBeenCalledTimes(2)
  } finally {
    w.unmount()
  }
})

it('F8 keeps unchanged mixed HTTP JSON locked until a target read started after its first terminal observation', async () => {
  const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
    .default
  // Real HTTP runs provide the unmodified receipt; fallback permits standalone mounted tests.
  const terminal = recovery({
    mode: 'REFRESH_SOURCE_WINDOW',
    status: 'SUCCEEDED',
    targetOutcome: 'RECOVERED',
  })
  const receipt = process.env.LOBANGERS_RECONCILE_FIXTURE
    ? JSON.parse(readFileSync(process.env.LOBANGERS_RECONCILE_FIXTURE, 'utf8'))
    : {
        initial: detail(),
        mixed: { ...detail(), latestRecovery: terminal },
        fresh: {
          ...detail(),
          post: {
            ...detail().post,
            contentHash: 'c'.repeat(64),
            updatedAt: '2026-10-28T02:00:00.000Z',
          },
          latestRecovery: terminal,
        },
        recovery: terminal,
      }
  calls.post.mockResolvedValue(receipt.initial)
  calls.recover.mockRejectedValue(new Error('Lost admitted response'))
  const w = mount(PostInvestigation, { props: { postId: receipt.initial.post.id } })
  try {
    await flushPromises()
    await w.get('select').setValue('REFRESH_SOURCE_WINDOW')
    await consent(w)
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(calls.recover).toHaveBeenCalledTimes(1)
    expect(calls.recover.mock.calls[0]?.[1]).toMatchObject({
      expectedUpdatedAt: receipt.recovery.expectedUpdatedAt,
      expectedContentHash: receipt.recovery.expectedContentHash,
      mode: receipt.recovery.mode,
    })
    calls.post.mockResolvedValue(receipt.mixed)
    await clickText(w, 'Reload captured post evidence')
    expect(w.text()).toContain(receipt.mixed.post.contentHash)
    expect(receipt.mixed.post.contentHash).not.toBe(receipt.fresh.post.contentHash)
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Recovery result must be reconciled')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(calls.recover).toHaveBeenCalledTimes(1)
    calls.post.mockResolvedValue(receipt.fresh)
    await clickText(w, 'Reload captured post evidence')
    expect(w.get('textarea').element.value).toBe('')
    await w.get('textarea').setValue('Fresh target reviewed with a new reason')
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
    expect(w.text()).toContain(receipt.fresh.post.contentHash)
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})

it.each(['UNCHANGED', 'RECOVERED'])(
  'F8 accepts matched terminal POST %s then exactly one explicit fresh GET',
  async (targetOutcome) => {
    const PostInvestigation = (await import('@web/modules/ingestion-admin/PostInvestigation.vue'))
      .default
    const terminal = recovery({ status: 'SUCCEEDED', targetOutcome })
    calls.post.mockResolvedValue(detail())
    calls.recover.mockResolvedValue(terminal)
    const w = mount(PostInvestigation, { props: { postId } })
    try {
      await flushPromises()
      await consent(w)
      await w.get('form').trigger('submit')
      await flushPromises()
      await consent(w)
      expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeDefined()
      expect(calls.post).toHaveBeenCalledTimes(1)
      calls.post.mockResolvedValue({ ...detail(), latestRecovery: terminal })
      await clickText(w, 'Reload captured post evidence')
      expect(calls.post).toHaveBeenCalledTimes(2)
      expect(w.get('textarea').element.value).toBe('')
      await consent(w)
      expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
      expect(calls.recover).toHaveBeenCalledTimes(1)
    } finally {
      w.unmount()
    }
  },
)

it('F8 retains a matched terminal POST barrier after child unmount without restoring protected detail', async () => {
  calls.posts.mockResolvedValue({ items: [detail().post], nextCursor: null })
  calls.post.mockResolvedValue(detail())
  let finish!: (value: unknown) => void
  calls.recover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const w = mount(FailedPosts)
  try {
    await flushPromises()
    await clickText(w, 'Investigate 123')
    await consent(w)
    await w.get('section[aria-label="Post investigation"] form').trigger('submit')
    await w.get('select').setValue('NEW')
    await flushPromises()
    finish(recovery({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED' }))
    await flushPromises()
    expect(w.find('section[aria-label="Post investigation"]').exists()).toBe(false)
    await w.get('select').setValue('FAILED')
    await w.get('form').trigger('submit')
    await flushPromises()
    await clickText(w, 'Investigate 123')
    expect(w.get('textarea').element.value).toBe('')
    await consent(w)
    expect(w.get('[data-testid="recover-post"]').attributes('disabled')).toBeUndefined()
    expect(calls.recover).toHaveBeenCalledTimes(1)
  } finally {
    w.unmount()
  }
})
