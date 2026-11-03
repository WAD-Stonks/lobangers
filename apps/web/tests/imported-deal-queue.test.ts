import type { IngestionDraft, IngestionDraftsResponse } from '@broke-oclock/contracts/ingestion'
import { flushPromises, mount } from '@vue/test-utils'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { ApiClientError } from '@web/lib/api-client'
import ImportedDealQueue from '@web/modules/ingestion-admin/ImportedDealQueue.vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { routeLocationKey, routerKey } from 'vue-router'

// Synthetic REST reads only; canonical Deals writes have their own policy coverage.
const rest = vi.hoisted(() => ({ drafts: vi.fn() }))
vi.mock('@web/lib/api-client', async () => {
  const { ApiClientError } = await import('@broke-oclock/api-client')
  return { ApiClientError, api: { ingestion: { drafts: rest.drafts } } }
})
const draft = {
  id: 'a'.repeat(24),
  title: '<img src=x onerror=unsafe()> Imported lunch',
  description: '<script>untrusted source</script>',
  terms: null,
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: null,
  validUntil: null,
  rawValidityText: 'While stocks last',
  applicability: 'NO_FIXED_LOCATION',
  merchantId: null,
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 7,
  sourceUrl: 'https://example.test/import',
  sourceName: 'Synthetic source',
  reviewNote: null,
  reviewReady: false,
} satisfies IngestionDraft
const deferred = () => {
  let resolve!: (value: IngestionDraftsResponse) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<IngestionDraftsResponse>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const href = (wrapper: ReturnType<typeof mount>, id = draft.id) => {
  const link = wrapper.get(`[data-testid="open-imported-${id}"]`).attributes('href')
  expect(link).toBeDefined()
  return new URL(link ?? '', 'https://example.test')
}
beforeEach(() => {
  confirmAdminIdentity(null)
  vi.resetAllMocks()
  rest.drafts.mockResolvedValue({ items: [], nextCursor: null })
})
it('hands exact imports to the full Deals editor without exposing partial write controls', async () => {
  rest.drafts.mockResolvedValue({ items: [draft], nextCursor: null })
  const wrapper = mount(ImportedDealQueue, { props: { revision: 0 } })
  try {
    await flushPromises()
    expect(rest.drafts).toHaveBeenCalledExactlyOnceWith({ limit: 20, status: 'PENDING' })
    expect(wrapper.text()).toContain(draft.title)
    expect(wrapper.text()).toContain('Validity needs clarification')
    expect(wrapper.text()).toContain('FOOD')
    expect(wrapper.find('img, script, form, textarea, input').exists()).toBe(false)
    expect(wrapper.findAll('select')).toHaveLength(1)
    expect(wrapper.findAll('button')).toHaveLength(0)
    const url = href(wrapper)
    expect(url.pathname).toBe('/admin/deals')
    expect(url.searchParams.get('dealId')).toBe(draft.id)
    expect(url.searchParams.get('tab')).toBe('content')
    expect(url.searchParams.get('returnTo')).toBe(
      `/admin/ingestion?status=PENDING&draftId=${draft.id}#queue-title`,
    )
  } finally {
    wrapper.unmount()
  }
})
it('distinguishes pending and failed initial reads from a successful empty queue', async () => {
  const pending = deferred()
  rest.drafts.mockReturnValueOnce(pending.promise)
  const wrapper = mount(ImportedDealQueue, { props: { revision: 0 } })
  try {
    expect(wrapper.text()).toContain('Loading imported deals')
    expect(wrapper.text()).not.toContain('0 imported deals loaded')
    pending.reject(new Error('Synthetic unavailable queue'))
    await flushPromises()
    expect(wrapper.text()).toContain('Unable to load imported deals')
    expect(wrapper.text()).not.toContain('No imported deals match')
    await wrapper.get('[data-testid="retry-imported-deals"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('0 imported deals loaded')
    expect(wrapper.text()).toContain('No imported deals match this status')
  } finally {
    wrapper.unmount()
  }
})
it('keeps source-image evidence optional and uses the existing safe media renderer', async () => {
  rest.drafts.mockResolvedValue({
    items: [
      {
        ...draft,
        images: [
          {
            sha256: 'a'.repeat(64),
            url: 'javascript:unsafe()',
            sourceUrl: 'javascript:unsafe()',
            altText: null,
            mimeType: 'image/svg+xml',
            sizeBytes: 12,
            status: 'HOSTED',
          },
        ],
      },
    ],
    nextCursor: null,
  })
  const wrapper = mount(ImportedDealQueue, { props: { revision: 0 } })
  try {
    await flushPromises()
    expect(wrapper.get('summary').text()).toBe('Source images')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Storage status: HOSTED')
    expect(wrapper.text()).toContain('Source link unavailable')
    expect(wrapper.get(`[data-testid="open-imported-${draft.id}"]`).text()).toContain(
      'Open in Deals',
    )
  } finally {
    wrapper.unmount()
  }
})
it('retains each row page cursor and restores only its bounded page with focus', async () => {
  const cursor = 'b'.repeat(24)
  const second = { ...draft, id: 'c'.repeat(24), title: 'Second page import' }
  rest.drafts
    .mockResolvedValueOnce({ items: [draft], nextCursor: cursor })
    .mockResolvedValue({ items: [second], nextCursor: null })
  const wrapper = mount(ImportedDealQueue, { attachTo: document.body, props: { revision: 0 } })
  try {
    await flushPromises()
    await wrapper.get('[data-testid="more-imported-deals"]').trigger('click')
    await flushPromises()
    expect(rest.drafts).toHaveBeenLastCalledWith({ limit: 20, status: 'PENDING', cursor })
    expect(
      new URL(
        href(wrapper).searchParams.get('returnTo') ?? '',
        'https://example.test',
      ).searchParams.has('draftCursor'),
    ).toBe(false)
    const secondReturn = new URL(
      href(wrapper, second.id).searchParams.get('returnTo') ?? '',
      'https://example.test',
    )
    expect(secondReturn.searchParams.get('draftCursor')).toBe(cursor)
    expect(secondReturn.searchParams.get('draftId')).toBe(second.id)
    await wrapper.setProps({ initialCursor: cursor, initialDraftId: second.id })
    await flushPromises()
    expect(rest.drafts).toHaveBeenCalledTimes(3)
    expect(rest.drafts).toHaveBeenLastCalledWith({ limit: 20, status: 'PENDING', cursor })
    expect(wrapper.find(`[data-testid="open-imported-${draft.id}"]`).exists()).toBe(false)
    const link = wrapper.get(`[data-testid="open-imported-${second.id}"]`)
    expect(link.attributes('aria-current')).toBe('true')
    expect(document.activeElement).toBe(link.element)
  } finally {
    wrapper.unmount()
  }
})
it('updates queue status and route context once, clearing stale row and post selections', async () => {
  const replace = vi.fn()
  const wrapper = mount(ImportedDealQueue, {
    props: { revision: 0 },
    global: {
      provide: {
        [routerKey as symbol]: { replace },
        [routeLocationKey as symbol]: {
          query: { postId: draft.id, draftId: draft.id, draftCursor: 'b'.repeat(24) },
        },
      },
    },
  })
  try {
    await flushPromises()
    await wrapper.get('#queue-status').setValue('REJECTED')
    await flushPromises()
    expect(rest.drafts).toHaveBeenLastCalledWith({ limit: 20, status: 'REJECTED' })
    expect(replace).toHaveBeenCalledWith({ query: { status: 'REJECTED' }, hash: '#queue-title' })
    await wrapper.setProps({ initialStatus: 'REJECTED' })
    await flushPromises()
    expect(rest.drafts).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('No imported deals match this status')
  } finally {
    wrapper.unmount()
  }
})
it.each(['UNAUTHORIZED', 'FORBIDDEN'] as const)(
  'clears retained pages and closes on %s',
  async (code) => {
    rest.drafts
      .mockResolvedValueOnce({ items: [draft], nextCursor: 'b'.repeat(24) })
      .mockRejectedValueOnce(new ApiClientError(code, code === 'FORBIDDEN' ? 403 : 401, 'Denied'))
    const wrapper = mount(ImportedDealQueue, { props: { revision: 0 } })
    try {
      await flushPromises()
      await wrapper.get('[data-testid="more-imported-deals"]').trigger('click')
      await flushPromises()
      expect(wrapper.emitted('denied')).toEqual([[code]])
      expect(wrapper.findAll('li')).toHaveLength(0)
      expect(wrapper.find('[data-testid="more-imported-deals"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Imported deal access is closed')
      expect(wrapper.get('#queue-status').attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  },
)
it.each(['result', 'denial'])(
  'ignores a superseded queue %s after a route context change',
  async (outcome) => {
    const old = deferred()
    rest.drafts.mockReturnValueOnce(old.promise).mockResolvedValue({ items: [], nextCursor: null })
    const wrapper = mount(ImportedDealQueue, { props: { revision: 0 } })
    try {
      await wrapper.setProps({ initialStatus: 'APPROVED' })
      await flushPromises()
      if (outcome === 'result') old.resolve({ items: [draft], nextCursor: draft.id })
      else old.reject(new ApiClientError('FORBIDDEN', 403, 'Superseded denial'))
      await flushPromises()
      expect(wrapper.emitted('denied')).toBeUndefined()
      expect(wrapper.findAll('li')).toHaveLength(0)
      expect(wrapper.text()).toContain('No imported deals match this status')
      expect(wrapper.find('[data-testid="more-imported-deals"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  },
)
it('keeps a failed page retry bounded and preserves previous row return cursors', async () => {
  const cursor = 'b'.repeat(24)
  rest.drafts
    .mockResolvedValueOnce({ items: [draft], nextCursor: cursor })
    .mockRejectedValueOnce(new Error('Synthetic read failure'))
    .mockResolvedValue({ items: [], nextCursor: null })
  const wrapper = mount(ImportedDealQueue, { props: { revision: 0 } })
  try {
    await flushPromises()
    await wrapper.get('[data-testid="more-imported-deals"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Unable to load imported deals')
    expect(wrapper.find(`[data-testid="open-imported-${draft.id}"]`).exists()).toBe(true)
    await wrapper.get('[data-testid="retry-imported-deals"]').trigger('click')
    await flushPromises()
    expect(rest.drafts).toHaveBeenLastCalledWith({ limit: 20, status: 'PENDING', cursor })
    expect(wrapper.find('[data-testid="more-imported-deals"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('1 imported deals loaded')
  } finally {
    wrapper.unmount()
  }
})
it('rejects malformed cursors without silently reading the first page', async () => {
  const wrapper = mount(ImportedDealQueue, {
    props: { revision: 0, initialCursor: 'x'.repeat(2001) },
  })
  try {
    await flushPromises()
    expect(rest.drafts).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('This queue link is invalid')
    await wrapper.get('[data-testid="retry-imported-deals"]').trigger('click')
    expect(rest.drafts).not.toHaveBeenCalled()
    await wrapper.get('#queue-status').setValue('PENDING')
    await flushPromises()
    expect(rest.drafts).toHaveBeenCalledExactlyOnceWith({ limit: 20, status: 'PENDING' })
  } finally {
    wrapper.unmount()
  }
})
it('shows missing linked rows without scanning other pages and clears reads on identity closure', async () => {
  const old = deferred()
  rest.drafts
    .mockResolvedValueOnce({ items: [], nextCursor: 'b'.repeat(24) })
    .mockReturnValueOnce(old.promise)
  const wrapper = mount(ImportedDealQueue, { props: { revision: 0, initialDraftId: draft.id } })
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('The linked imported deal is no longer on this page')
    expect(rest.drafts).toHaveBeenCalledTimes(1)
    await wrapper.get('[data-testid="more-imported-deals"]').trigger('click')
    confirmAdminIdentity(null)
    old.resolve({ items: [draft], nextCursor: null })
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.text()).toContain('Imported deal access is closed')
    expect(wrapper.emitted('busy')?.at(-1)).toEqual([false])
    await wrapper.setProps({ revision: 1, initialStatus: 'APPROVED' })
    await flushPromises()
    expect(rest.drafts).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Imported deal access is closed')
  } finally {
    wrapper.unmount()
  }
})
