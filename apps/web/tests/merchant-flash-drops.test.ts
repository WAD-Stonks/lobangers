import type { MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import FlashDropForm from '@web/modules/merchant/FlashDropForm.vue'
import FlashDropList from '@web/modules/merchant/FlashDropList.vue'
import { flashDropErrorMessage } from '@web/modules/merchant/flash-drop-api'
import {
  bannerPreview,
  blankFlashDropForm,
  checkFlashDropForm,
  type FlashDropFormState,
  formFromDrop,
  outletAfterDealChange,
  statusSentence,
  stepCodes,
  summaryLine,
  toFlashDropBody,
  toLocalInput,
} from '@web/modules/merchant/flash-drop-rules'
import type { MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import { afterEach, describe, expect, it } from 'vitest'

enableAutoUnmount(afterEach)

// Labelled synthetic fixtures: none of these are real outlets, deals or drops.
const NOW = new Date('2026-11-02T10:00:00+08:00')
const HOUR = 3_600_000

const outlets: MerchantOutlet[] = [
  { id: 'outlet-a', name: 'Synthetic Stall (Maxwell)', address: '1 Fake St' },
  { id: 'outlet-b', name: 'Synthetic Stall (Bedok)', address: '2 Fake St' },
]

const deal = (overrides: Partial<MerchantDeal> = {}): MerchantDeal => ({
  id: 'deal-priced',
  title: 'Synthetic chicken rice',
  description: 'Fake deal for tests.',
  category: 'FOOD',
  cuisine: null,
  outletIds: ['outlet-a'],
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  priceCents: 350,
  startDate: '',
  endDate: '',
  terms: '',
  endedAt: null,
  ...overrides,
})
const pricedDeal = deal()
const bogoDeal = deal({
  id: 'deal-bogo',
  title: 'Synthetic 1-for-1',
  offerType: 'BUY_ONE_GET_ONE',
  priceCents: null,
  outletIds: ['outlet-a', 'outlet-b'],
})

const validForm = (overrides: Partial<FlashDropFormState> = {}): FlashDropFormState => ({
  ...blankFlashDropForm(pricedDeal, outlets),
  priceDollars: 1.5,
  ...overrides,
})

const drop = (overrides: Partial<MerchantFlashDrop> = {}): MerchantFlashDrop => ({
  id: 'drop-1',
  dealId: 'deal-priced',
  dealTitle: 'Synthetic chicken rice',
  outletId: 'outlet-a',
  outletName: 'Synthetic Stall (Maxwell)',
  flashPriceCents: 150,
  usualPriceCents: 350,
  startsAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
  endsAt: new Date(NOW.getTime() + 2.5 * HOUR).toISOString(),
  radiusMetres: 500,
  codeLimit: 40,
  claimedCount: 0,
  status: 'IN_REVIEW',
  reviewNote: null,
  version: 1,
  demo: true,
  ...overrides,
})

describe('checkFlashDropForm', () => {
  it('accepts a complete form', () => {
    expect(checkFlashDropForm(validForm(), pricedDeal, NOW)).toBe('')
  })

  it('asks for a deal and a price', () => {
    expect(checkFlashDropForm(validForm(), undefined, NOW)).toBe('Choose which deal to drop.')
    expect(checkFlashDropForm(validForm({ priceDollars: '' }), pricedDeal, NOW)).toMatch(
      /Enter the flash price/,
    )
    expect(checkFlashDropForm(validForm({ priceDollars: 0 }), pricedDeal, NOW)).toMatch(
      /Enter the flash price/,
    )
  })

  it('needs a price lower than the usual price when the deal has one', () => {
    expect(checkFlashDropForm(validForm({ priceDollars: 3.5 }), pricedDeal, NOW)).toBe(
      'The flash price has to be lower than the usual $3.50.',
    )
    expect(checkFlashDropForm(validForm({ priceDollars: 3.49 }), pricedDeal, NOW)).toBe('')
    // No set price to compare with.
    const form = validForm({ dealId: bogoDeal.id, priceDollars: 9 })
    expect(checkFlashDropForm(form, bogoDeal, NOW)).toBe('')
  })

  it('checks the codes and outlet', () => {
    expect(checkFlashDropForm(validForm({ codeLimit: 5 }), pricedDeal, NOW)).toMatch(/between 10/)
    expect(checkFlashDropForm(validForm({ outletId: '' }), pricedDeal, NOW)).toMatch(/outlet/)
    expect(checkFlashDropForm(validForm({ outletId: 'outlet-b' }), pricedDeal, NOW)).toBe(
      'That deal does not run at the chosen outlet.',
    )
  })

  it('refuses a start in the past or more than 7 days ahead', () => {
    const later = (ms: number) =>
      validForm({ startMode: 'LATER', startLocal: toLocalInput(new Date(NOW.getTime() + ms)) })
    expect(checkFlashDropForm(validForm({ startMode: 'LATER' }), pricedDeal, NOW)).toMatch(/when/)
    expect(checkFlashDropForm(later(-HOUR), pricedDeal, NOW)).toMatch(/cannot start in the past/)
    expect(checkFlashDropForm(later(8 * 24 * HOUR), pricedDeal, NOW)).toMatch(/at most a week/)
    expect(checkFlashDropForm(later(6 * 24 * HOUR), pricedDeal, NOW)).toBe('')
  })

  it('needs the deal to run for the whole drop', () => {
    const today = NOW.toLocaleDateString('en-CA')
    const late = validForm({
      startMode: 'LATER',
      startLocal: toLocalInput(new Date(NOW.getTime() + 2 * 24 * HOUR)),
    })
    expect(checkFlashDropForm(late, deal({ endDate: today }), NOW)).toBe(
      'Choose one of your deals that runs for the whole drop.',
    )
    expect(checkFlashDropForm(validForm(), deal({ startDate: '2026-12-01' }), NOW)).toMatch(
      /only starts on 2026-12-01/,
    )
  })
})

describe('flash drop form helpers', () => {
  it('steps codes by 10 between 10 and 200', () => {
    expect(stepCodes(40, 1)).toBe(50)
    expect(stepCodes(10, -1)).toBe(10)
    expect(stepCodes(200, 1)).toBe(200)
  })

  it('picks the outlet when the deal changes', () => {
    expect(outletAfterDealChange('', pricedDeal, outlets)).toBe('outlet-a')
    expect(outletAfterDealChange('outlet-b', bogoDeal, outlets)).toBe('outlet-b')
    expect(outletAfterDealChange('outlet-b', pricedDeal, outlets)).toBe('outlet-a')
    expect(outletAfterDealChange('', bogoDeal, outlets)).toBe('')
  })

  it('builds the request body in cents with "now" as the send time', () => {
    expect(toFlashDropBody(validForm({ priceDollars: 1.1 }), NOW)).toEqual({
      dealId: 'deal-priced',
      outletId: 'outlet-a',
      flashPriceCents: 110,
      startsAt: NOW.toISOString(),
      durationMinutes: 30,
      radiusMetres: 500,
      codeLimit: 40,
    })
  })

  it('fills the form back in from a sent-back drop', () => {
    const form = formFromDrop(drop({ status: 'SENT_BACK', radiusMetres: 1000 }))
    expect(form).toMatchObject({ priceDollars: 1.5, durationMinutes: 30, radiusMetres: 1000 })
    expect(form.startMode).toBe('LATER')
    expect(new Date(form.startLocal).getTime()).toBe(NOW.getTime() + 2 * HOUR)
  })

  it('previews the banner text', () => {
    expect(bannerPreview(validForm(), pricedDeal)).toBe(
      'FLASH DROP · $1.50 Synthetic chicken rice · 30:00 · within 500 m',
    )
    expect(bannerPreview(validForm({ priceDollars: '', radiusMetres: 1000 }), undefined)).toBe(
      'FLASH DROP · $? your deal · 30:00 · within 1 km',
    )
  })

  it('describes each drop', () => {
    expect(summaryLine(drop(), NOW)).toMatch(
      /^Synthetic Stall \(Maxwell\) · Today .* · 30 min · 500 m · 40 codes$/,
    )
    expect(statusSentence(drop(), NOW)).toBe('In review. LoBangers is checking it.')
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
  })
})

describe('flashDropErrorMessage', () => {
  it('shows the server explanation for refused drops', () => {
    const clash = new ApiClientError(
      'CONFLICT',
      409,
      'Another flash drop at this outlet already covers that time',
    )
    expect(flashDropErrorMessage(clash, 'fallback')).toBe(
      'Another flash drop at this outlet already covers that time',
    )
    const price = new ApiClientError(
      'BAD_REQUEST',
      400,
      'The flash price has to be lower than the usual price',
    )
    expect(flashDropErrorMessage(price, 'fallback')).toMatch(/lower than the usual/)
  })

  it('falls back for generic and unknown errors', () => {
    expect(
      flashDropErrorMessage(new ApiClientError('BAD_REQUEST', 400, 'Invalid request'), 'x'),
    ).toBe('x')
    expect(
      flashDropErrorMessage(new ApiClientError('UNAUTHORIZED', 401, 'Unauthorized'), 'x'),
    ).toMatch(/session has ended/)
    expect(flashDropErrorMessage(new Error('boom'), 'x')).toBe('x')
  })
})

describe('FlashDropForm', () => {
  const mountForm = (props: Partial<InstanceType<typeof FlashDropForm>['$props']> = {}) =>
    mount(FlashDropForm, {
      props: {
        deals: [pricedDeal, bogoDeal],
        outlets,
        initial: blankFlashDropForm(pricedDeal, outlets),
        editing: false,
        saving: false,
        serverError: '',
        sample: true,
        ...props,
      },
    })

  it('shows a clear error and does not submit when the price is not lower', async () => {
    const wrapper = mountForm()
    await wrapper.get('#flash-price').setValue('3.5')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'The flash price has to be lower than the usual $3.50.',
    )
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('submits a valid drop and updates the preview and stepper', async () => {
    const wrapper = mountForm()
    await wrapper.get('#flash-price').setValue('1.5')
    await wrapper.get('button[aria-label="More codes"]').trigger('click')
    await wrapper.get('#flash-radius-1000').setValue(true)
    expect(wrapper.get('output').text()).toBe('50')
    expect(wrapper.get('[data-testid="flash-preview"]').text()).toBe(
      'FLASH DROP · $1.50 Synthetic chicken rice · 30:00 · within 1 km',
    )
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      dealId: 'deal-priced',
      priceDollars: 1.5,
      codeLimit: 50,
      radiusMetres: 1000,
      outletId: 'outlet-a',
    })
  })

  it('only offers the outlets the chosen deal runs at', async () => {
    const wrapper = mountForm()
    expect(wrapper.findAll('input[name="flash-outlet"]')).toHaveLength(1)
    await wrapper.get('#flash-deal').setValue('deal-bogo')
    expect(wrapper.findAll('input[name="flash-outlet"]')).toHaveLength(2)
  })

  it('blocks a second submit while sending and shows server errors', async () => {
    const wrapper = mountForm({
      saving: true,
      serverError: 'Another flash drop at this outlet already covers that time',
    })
    const button = wrapper.get('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.text()).toBe('Sending…')
    await wrapper.get('#flash-price').setValue('1.5')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/already covers that time/)
  })

  it('labels the form as fake only in sample mode', () => {
    expect(mountForm().text()).toContain('Fake deal')
    expect(mountForm({ sample: false }).text()).not.toContain('Fake deal')
  })
})

describe('FlashDropList', () => {
  const drops = [
    drop({ id: 'review' }),
    drop({ id: 'back', status: 'SENT_BACK', reviewNote: 'Synthetic note: use 500 m.' }),
    drop({ id: 'live', status: 'LIVE', claimedCount: 12, startsAt: NOW.toISOString() }),
    drop({ id: 'ended', status: 'ENDED', claimedCount: 40 }),
  ]
  const mountList = (sample: boolean) =>
    mount(FlashDropList, { props: { drops, sample, busyId: null, now: NOW } })
  const card = (wrapper: ReturnType<typeof mountList>, id: string) =>
    wrapper.get(`[data-testid="flash-drop-${id}"]`)

  it('shows the right actions, note and progress for each status', async () => {
    const wrapper = mountList(true)
    expect(card(wrapper, 'review').text()).toContain('Withdraw')
    expect(card(wrapper, 'review').text()).toContain('Simulate approval (demo)')
    expect(card(wrapper, 'back').text()).toContain('LoBangers: “Synthetic note: use 500 m.”')
    expect(card(wrapper, 'live').text()).toContain('12 of 40 claimed')
    expect(card(wrapper, 'live').text()).toContain('End drop early')
    expect(card(wrapper, 'ended').text()).toContain('40 of 40 claimed')
    expect(card(wrapper, 'ended').findAll('button')).toHaveLength(0)
    expect(wrapper.findAll('.fake-badge')).toHaveLength(4)

    await card(wrapper, 'back').get('button').trigger('click')
    expect(wrapper.emitted('resend')?.[0]?.[0]).toMatchObject({ id: 'back' })
    await card(wrapper, 'review').findAll('button')[0]?.trigger('click')
    expect(wrapper.emitted('approve')?.[0]?.[0]).toMatchObject({ id: 'review' })
  })

  it('hides every demo-only control when sample data is off', () => {
    const real = drops.map((item) => ({ ...item, demo: false }))
    const wrapper = mount(FlashDropList, {
      props: { drops: real, sample: false, busyId: null, now: NOW },
    })
    expect(wrapper.text()).not.toContain('(demo)')
    expect(wrapper.text()).not.toContain('Fake deal')
    expect(card(wrapper, 'review').text()).toContain('Withdraw')
  })
})
