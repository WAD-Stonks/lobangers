import type { MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import FlashDealFields from '@web/modules/merchant/FlashDealFields.vue'
import FlashDropList from '@web/modules/merchant/FlashDropList.vue'
import { flashDropErrorMessage } from '@web/modules/merchant/flash-drop-api'
import {
  bannerPreview,
  blankFlashFields,
  type FlashFieldsState,
  flashFieldsFromDrop,
  flashFieldsProblem,
  STATUS_LABELS,
  statusSentence,
  stepCodes,
  summaryLine,
  toFlashDropBody,
  toLocalInput,
} from '@web/modules/merchant/flash-drop-rules'
import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'

enableAutoUnmount(afterEach)

// Labelled synthetic fixtures: none of these are real outlets, deals or flash deals.
const NOW = new Date('2026-11-02T10:00:00+08:00')
const HOUR = 3_600_000
const USUAL = 350 // the usual price a $1.50 flash price beats

const fields = (overrides: Partial<FlashFieldsState> = {}): FlashFieldsState => ({
  ...blankFlashFields(),
  usualDollars: 3.5,
  ...overrides,
})
// The flash offer comes from the deal form's own Offer type.
const fixed = { offerType: 'FIXED_PRICE' as const, priceCents: 150 }

const drop = (overrides: Partial<MerchantFlashDrop> = {}): MerchantFlashDrop => ({
  id: 'drop-1',
  dealId: 'deal-1',
  dealTitle: 'Synthetic chicken rice',
  outletId: 'outlet-a',
  outletName: 'Synthetic Stall (Maxwell)',
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  flashPriceCents: 150,
  usualPriceCents: USUAL,
  startsAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
  endsAt: new Date(NOW.getTime() + 2.5 * HOUR).toISOString(),
  radiusMetres: 500,
  codeLimit: 40,
  claimedCount: 0,
  status: 'DRAFT',
  reviewNote: null,
  version: 1,
  demo: false,
  startsOnGoLive: false,
  deal: {
    title: 'Synthetic chicken rice',
    description: 'Fake deal for tests.',
    category: 'FOOD',
    cuisine: null,
    offerType: 'FIXED_PRICE',
    discountPercent: null,
    priceCents: 150,
    terms: '',
    photo: null,
  },
  ...overrides,
})

describe('flashFieldsProblem', () => {
  it('accepts complete flash details', () => {
    expect(flashFieldsProblem(fields(), fixed, NOW)).toBeNull()
  })

  it('lets a fixed flash price add an optional usual price above it', () => {
    expect(flashFieldsProblem(fields({ usualDollars: '' }), fixed, NOW)).toBeNull()
    expect(flashFieldsProblem(fields({ usualDollars: 1.5 }), fixed, NOW)).toEqual({
      field: 'flashUsual',
      message: 'The usual price has to be higher than the flash price of $1.50.',
    })
    expect(flashFieldsProblem(fields({ usualDollars: 0 }), fixed, NOW)?.message).toMatch(
      /Enter the usual price/,
    )
    // Other offers have no usual price to check.
    const bogo = { offerType: 'BUY_ONE_GET_ONE' as const, priceCents: null }
    expect(flashFieldsProblem(fields({ usualDollars: 0 }), bogo, NOW)).toBeNull()
  })

  it('checks the codes', () => {
    expect(flashFieldsProblem(fields({ codeLimit: 5 }), fixed, NOW)).toEqual({
      field: 'flashCodes',
      message: 'Give out between 10 and 200 codes.',
    })
  })

  it('needs a start time ahead, within 7 days, unless it starts at Go live', () => {
    const later = (ms: number) =>
      fields({ startMode: 'LATER', startLocal: toLocalInput(new Date(NOW.getTime() + ms)) })
    expect(flashFieldsProblem(fields({ startMode: 'LATER' }), fixed, NOW)?.message).toMatch(/when/)
    expect(flashFieldsProblem(later(-HOUR), fixed, NOW)?.message).toMatch(
      /cannot start in the past/,
    )
    expect(flashFieldsProblem(later(8 * 24 * HOUR), fixed, NOW)?.message).toMatch(/at most a week/)
    expect(flashFieldsProblem(later(6 * 24 * HOUR), fixed, NOW)).toBeNull()
    expect(flashFieldsProblem(fields({ startMode: 'GO_LIVE' }), fixed, NOW)).toBeNull()
  })
})

describe('flash deal helpers', () => {
  it('steps codes by 10 between 10 and 200', () => {
    expect(stepCodes(40, 1)).toBe(50)
    expect(stepCodes(10, -1)).toBe(10)
    expect(stepCodes(200, 1)).toBe(200)
  })

  it('builds the request body in cents, with no start time for "when I press Go live"', () => {
    const deal = {
      title: 'Synthetic chicken rice',
      description: 'Fake deal.',
      category: 'FOOD' as const,
      cuisine: null,
      offerType: 'FIXED_PRICE' as const,
      discountPercent: null,
      priceCents: 110,
      terms: '',
      photoKey: null,
    }
    expect(toFlashDropBody(deal, 'outlet-a', fields({ usualDollars: 4 }))).toEqual({
      ...deal,
      outletId: 'outlet-a',
      usualPriceCents: 400,
      startsAt: null,
      durationMinutes: 30,
      radiusMetres: 500,
      codeLimit: 40,
    })
    const startLocal = toLocalInput(new Date(NOW.getTime() + HOUR))
    const timed = toFlashDropBody(deal, 'outlet-a', fields({ startMode: 'LATER', startLocal }))
    expect(timed.startsAt).toBe(new Date(startLocal).toISOString())
    // A usual price only goes with a fixed flash price.
    const bogo = { ...deal, offerType: 'BUY_ONE_GET_ONE' as const, priceCents: null }
    expect(toFlashDropBody(bogo, 'outlet-a', fields()).usualPriceCents).toBeNull()
  })

  it('fills the flash fields back in from a draft', () => {
    const timed = flashFieldsFromDrop(drop({ radiusMetres: 1000 }))
    expect(timed).toMatchObject({ usualDollars: 3.5, durationMinutes: 30, radiusMetres: 1000 })
    expect(timed.startMode).toBe('LATER')
    expect(new Date(timed.startLocal).getTime()).toBe(NOW.getTime() + 2 * HOUR)
    expect(flashFieldsFromDrop(drop({ startsOnGoLive: true }))).toMatchObject({
      startMode: 'GO_LIVE',
      startLocal: '',
    })
  })

  it('previews the banner text for each kind of flash offer', () => {
    const offer = (offerType: MerchantFlashDrop['offerType'], extra = {}) => ({
      offerType,
      discountPercent: null,
      flashPriceCents: null,
      ...extra,
    })
    expect(
      bannerPreview(
        fields(),
        'Synthetic chicken rice',
        offer('FIXED_PRICE', { flashPriceCents: 150 }),
      ),
    ).toBe('FLASH DROP · $1.50 Synthetic chicken rice · 30:00 · within 500\u00a0m')
    expect(bannerPreview(fields(), 'Synthetic chicken rice', offer('BUY_ONE_GET_ONE'))).toBe(
      'FLASH DROP · 1-for-1 Synthetic chicken rice · 30:00 · within 500\u00a0m',
    )
    expect(
      bannerPreview(fields(), 'Synthetic kopi', offer('PERCENT_OFF', { discountPercent: 30 })),
    ).toBe('FLASH DROP · 30% off Synthetic kopi · 30:00 · within 500\u00a0m')
    expect(bannerPreview(fields({ radiusMetres: 1000 }), ' ', offer('OTHER'))).toBe(
      'FLASH DROP · your deal · 30:00 · within 1\u00a0km',
    )
  })

  it('describes each flash deal', () => {
    expect(summaryLine(drop(), NOW)).toMatch(
      /^Synthetic Stall \(Maxwell\) · Today .* · 30 min · 500 m · 40 codes$/,
    )
    expect(summaryLine(drop({ startsOnGoLive: true }), NOW)).toContain('Starts at Go live')
    expect(statusSentence(drop(), NOW)).toMatch(/^Draft\. Nobody can see it yet\. Press Go live/)
    expect(statusSentence(drop({ startsOnGoLive: true }), NOW)).toBe(
      'Draft. Nobody can see it yet. It starts as soon as you press Go live.',
    )
    expect(statusSentence(drop({ status: 'SCHEDULED' }), NOW)).toMatch(/^Going live today/)
    expect(statusSentence(drop({ status: 'ENDED', claimedCount: 40 }), NOW)).toBe(
      'All 40 codes claimed.',
    )
    expect(statusSentence(drop({ status: 'ENDED', claimedCount: 12 }), NOW)).toBe(
      'Ended. 12 of 40 codes claimed.',
    )
    const live = drop({
      status: 'LIVE',
      endsAt: new Date(NOW.getTime() + 20 * 60_000).toISOString(),
    })
    expect(statusSentence(live, NOW)).toBe('Live now · 20 min left')
    expect(statusSentence(drop({ status: 'STOPPED' }), NOW)).toBe('Removed by LoBangers.')
    expect(STATUS_LABELS.STOPPED).toBe('Removed')
  })
})

describe('flashDropErrorMessage', () => {
  it('shows the server explanation for refused flash deals', () => {
    const clash = new ApiClientError(
      'CONFLICT',
      409,
      'Another flash deal at this outlet already covers that time',
    )
    expect(flashDropErrorMessage(clash, 'fallback')).toBe(
      'Another flash deal at this outlet already covers that time',
    )
    const late = new ApiClientError(
      'BAD_REQUEST',
      400,
      'Its start time has passed. Edit the flash deal and choose a new time.',
    )
    expect(flashDropErrorMessage(late, 'fallback')).toMatch(/start time has passed/)
  })

  it('falls back for generic and unknown errors', () => {
    expect(
      flashDropErrorMessage(new ApiClientError('BAD_REQUEST', 400, 'Invalid request'), 'x'),
    ).toBe('x')
    expect(
      flashDropErrorMessage(new ApiClientError('UNAUTHORIZED', 401, 'Unauthorized'), 'x'),
    ).toMatch(/session has ended/)
    expect(flashDropErrorMessage(new ApiClientError('CONFLICT', 409, 'Conflict'), 'x')).toMatch(
      /changed just now/,
    )
    expect(flashDropErrorMessage(new Error('boom'), 'x')).toBe('x')
  })
})

describe('FlashDealFields', () => {
  type Offer = Pick<MerchantFlashDrop, 'offerType' | 'discountPercent' | 'flashPriceCents'>
  const fixedOffer: Offer = {
    offerType: 'FIXED_PRICE',
    discountPercent: null,
    flashPriceCents: 150,
  }
  const mountFields = (
    props: { problem?: ReturnType<typeof flashFieldsProblem>; offer?: Offer } = {},
  ) => {
    const model = ref(fields({ usualDollars: '' }))
    const wrapper = mount(FlashDealFields, {
      props: {
        modelValue: model.value,
        'onUpdate:modelValue': (value: FlashFieldsState) => {
          model.value = value
          void wrapper.setProps({ modelValue: value })
        },
        title: 'Synthetic chicken rice',
        offer: props.offer ?? fixedOffer,
        problem: props.problem ?? null,
      },
    })
    return { wrapper, model }
  }

  it('updates the preview, stepper and choices as the merchant fills it in', async () => {
    const { wrapper, model } = mountFields()
    await wrapper.get('#flash-usual').setValue('4')
    await wrapper.get('button[aria-label="More codes"]').trigger('click')
    await wrapper.get('#flash-radius-1000').setValue(true)
    expect(wrapper.get('output').text()).toBe('50')
    expect(wrapper.get('[data-testid="flash-preview"]').text()).toBe(
      'FLASH DROP · $1.50 Synthetic chicken rice · 30:00 · within 1 km',
    )
    expect(model.value).toMatchObject({ usualDollars: 4, codeLimit: 50, radiusMetres: 1000 })
  })

  it('only asks for a usual price for a fixed flash price', () => {
    expect(mountFields().wrapper.find('#flash-usual').exists()).toBe(true)
    const { wrapper } = mountFields({
      offer: { offerType: 'BUY_ONE_GET_ONE', discountPercent: null, flashPriceCents: null },
    })
    expect(wrapper.find('#flash-usual').exists()).toBe(false)
    expect(wrapper.get('[data-testid="flash-preview"]').text()).toContain('1-for-1 Synthetic')
  })

  it('only asks for a start time when "Pick a time" is chosen', async () => {
    const { wrapper } = mountFields()
    expect(wrapper.find('#flash-start-at').exists()).toBe(false)
    await wrapper.get('#flash-start-LATER').setValue(true)
    expect(wrapper.find('#flash-start-at').exists()).toBe(true)
  })

  it('shows a problem beside its field', () => {
    const { wrapper } = mountFields({
      problem: {
        field: 'flashUsual',
        message: 'The usual price has to be higher than the flash price of $1.50.',
      },
    })
    const usual = wrapper.get('#flash-usual')
    expect(usual.attributes('aria-invalid')).toBe('true')
    expect(usual.attributes('aria-describedby')).toContain('error-flashUsual')
    expect(wrapper.get('#error-flashUsual').text()).toMatch(/higher than the flash price/)
  })
})

describe('FlashDropList', () => {
  const drops = [
    drop({ id: 'draft' }),
    drop({ id: 'scheduled', status: 'SCHEDULED' }),
    drop({ id: 'live', status: 'LIVE', claimedCount: 12, startsAt: NOW.toISOString() }),
    drop({ id: 'ended', status: 'ENDED', claimedCount: 40 }),
    drop({ id: 'removed', status: 'STOPPED', reviewNote: 'Synthetic note: misleading price.' }),
  ]
  const mountList = () =>
    mount(FlashDropList, { props: { drops, busyId: null, now: NOW, empty: 'Nothing.' } })
  const card = (wrapper: ReturnType<typeof mountList>, id: string) =>
    wrapper.get(`[data-testid="flash-drop-${id}"]`)
  // The visible label only, without the screen-reader text that names the deal.
  const buttons = (wrapper: ReturnType<typeof mountList>, id: string) =>
    card(wrapper, id)
      .findAll('button')
      .map((button) => button.element.childNodes[0]?.textContent?.trim())

  it('shows the right actions, note and progress for each status', async () => {
    const wrapper = mountList()
    expect(buttons(wrapper, 'draft')).toEqual(['Go live', 'Edit', 'Delete draft'])
    expect(buttons(wrapper, 'scheduled')).toEqual(['End now'])
    expect(buttons(wrapper, 'live')).toEqual(['End now'])
    // Past flash deals can be deleted from the history.
    expect(buttons(wrapper, 'ended')).toEqual(['Delete'])
    expect(buttons(wrapper, 'removed')).toEqual(['Delete'])
    expect(card(wrapper, 'live').text()).toContain('12 of 40 claimed')
    expect(card(wrapper, 'ended').text()).toContain('40 of 40 claimed')
    expect(card(wrapper, 'removed').text()).toContain(
      'LoBangers: “Synthetic note: misleading price.”',
    )
    expect(wrapper.find('.fake-badge').exists()).toBe(false)

    const draftButtons = card(wrapper, 'draft').findAll('button')
    await draftButtons[0]?.trigger('click')
    await draftButtons[1]?.trigger('click')
    await draftButtons[2]?.trigger('click')
    await card(wrapper, 'live').get('button').trigger('click')
    await card(wrapper, 'ended').get('button').trigger('click')
    expect(wrapper.emitted('goLive')?.[0]?.[0]).toMatchObject({ id: 'draft' })
    expect(wrapper.emitted('edit')?.[0]?.[0]).toMatchObject({ id: 'draft' })
    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ id: 'draft' })
    expect(wrapper.emitted('remove')?.[1]?.[0]).toMatchObject({ id: 'ended' })
    expect(wrapper.emitted('end')?.[0]?.[0]).toMatchObject({ id: 'live' })
  })

  it('says so when the list is empty, and labels demo flash deals as fake', () => {
    const empty = mount(FlashDropList, {
      props: { drops: [], busyId: null, now: NOW, empty: 'No drafts.' },
    })
    expect(empty.text()).toBe('No drafts.')
    const demo = mount(FlashDropList, {
      props: { drops: [drop({ demo: true })], busyId: null, now: NOW, empty: '' },
    })
    expect(demo.find('.fake-badge').exists()).toBe(true)
  })
})
