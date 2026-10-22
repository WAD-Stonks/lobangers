import type { IngestionDraft } from '@broke-oclock/contracts/ingestion'
import { flushPromises, mount } from '@vue/test-utils'
import { api } from '@web/lib/api-client'
import DraftQueue from '@web/modules/ingestion-admin/DraftQueue.vue'
import { expect, it, type TestContext } from 'vitest'

// Synthetic Axios responses exercise the real contract parser and mounted Vue UI.
// Real HTTP/native authorization and disposable Mongo are covered by the API writer suite.
const id = '111111111111111111111111'
const draft: IngestionDraft = {
  id,
  title: 'Synthetic campaign',
  description: 'Synthetic evidence',
  terms: null,
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: '2099-01-01T00:00:00Z',
  validUntil: '2099-12-01T00:00:00Z',
  rawValidityText: null,
  applicability: 'SELECTED_OUTLETS',
  merchantId: '222222222222222222222222',
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 2,
  sourceUrl: 'https://example.test/source',
  sourceName: 'Synthetic source',
  reviewNote: null,
  reviewReady: true,
  approvalReady: false,
  scopeStatus: 'UNCONFIRMED',
  physicalEligibilityReady: false,
}
const setup = async (
  ctx: TestContext,
  row = draft,
  venuePage = { items: [], nextCursor: null as string | null },
) => {
  const calls: string[] = []
  const previous = api.http.defaults.adapter
  api.http.defaults.adapter = async (config) => {
    calls.push(config.method ?? '')
    return {
      data:
        config.url === '/admin/venues'
          ? venuePage
          : config.method === 'post'
            ? { id, reviewStatus: 'APPROVED' }
            : { items: [row], nextCursor: null },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  ctx.onTestFinished(() => {
    wrapper.unmount()
    api.http.defaults.adapter = previous
  })
  await flushPromises()
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  await wrapper.get('#review-note').setValue('Read current content and evidence')
  return { wrapper, calls }
}

it('labels approved nonspatial content as unconfirmed rather than publicly eligible', async (ctx) => {
  const { wrapper } = await setup(ctx, {
    ...draft,
    applicability: 'NO_FIXED_LOCATION',
    merchantId: null,
    reviewStatus: 'APPROVED',
    approvalReady: true,
  })
  expect(wrapper.get('article').text()).toContain(
    'Scope unconfirmed. Content approval does not establish public or map eligibility.',
  )
})

it('renders multiple associated outlets with bounded-display disclosure instead of claiming no association', async (ctx) => {
  const { wrapper } = await setup(ctx, {
    ...draft,
    outlets: [
      {
        id: '333333333333333333333333',
        name: 'Synthetic branch A',
        address: 'A address',
        merchantName: 'Merchant',
      },
      {
        id: '444444444444444444444444',
        name: 'Synthetic branch B',
        address: 'B address',
        merchantName: 'Merchant',
      },
    ],
    outletCount: 21,
    outletsTruncated: true,
  })
  expect(wrapper.get('article').text()).toContain(
    'Showing 2 of 21 associated outlets. Display is truncated; approval checks the complete set.',
  )
})

it('does not claim an empty verified catalogue when a bounded scan has a continuation', async (ctx) => {
  const { wrapper } = await setup(ctx, draft, { items: [], nextCursor: '333333333333333333333333' })
  await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
  await flushPromises()
  expect(wrapper.get('article').text()).toContain(
    'No selectable verified outlets on this page. More catalogue rows remain; load more.',
  )
})

it('does not offer single-outlet replacement for a known multi-outlet draft', async (ctx) => {
  const { wrapper } = await setup(ctx, { ...draft, outletCount: 2 })
  expect(wrapper.find('[data-testid="outlet-association"]').exists()).toBe(false)
})

it('blocks programmatic physical approval submits without disabling rejection', async (ctx) => {
  const { wrapper, calls } = await setup(ctx)
  await wrapper.get('article > form').trigger('submit')
  expect(calls.filter((method) => method === 'post')).toEqual([])
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeUndefined()
})

it('allows nonspatial content review without claiming confirmed scope', async (ctx) => {
  const { wrapper, calls } = await setup(ctx, {
    ...draft,
    applicability: 'NO_FIXED_LOCATION',
    merchantId: null,
    approvalReady: true,
  })
  await wrapper.get('article > form').trigger('submit')
  await flushPromises()
  expect(calls.filter((method) => method === 'post')).toHaveLength(1)
})

it('honors server physical approval readiness even for a content-reviewable draft', async (ctx) => {
  const { wrapper } = await setup(ctx)
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
})
