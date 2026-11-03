import {
  ADD_DEAL_STEPS,
  checkDeal,
  emptyDealForm,
  errorsForStep,
  firstStepWithErrors,
  toNewDeal,
} from '@web/modules/add-deal/add-deal-steps'
import { describe, expect, it } from 'vitest'

const today = '2026-11-04'
const complete = () => ({
  ...emptyDealForm(),
  title: ' Kopi ',
  description: ' Two for one ',
  category: 'DRINKS',
  cuisine: 'NONE',
  offerType: 'BUY_ONE_GET_ONE' as const,
  startDate: '2026-11-04',
  endDate: '2026-11-30',
  terms: ' Dine-in only ',
})
const ready = { stallCount: 1, hasPhoto: true, today }

describe('add a deal steps', () => {
  it('runs details, location, validity, then review', () => {
    expect(ADD_DEAL_STEPS.map((step) => step.label)).toEqual([
      'Deal Details',
      'Location',
      'Validity',
      'Review',
    ])
  })

  it('files each problem under the step that asks for it', () => {
    const errors = checkDeal(emptyDealForm(), { stallCount: 0, hasPhoto: false, today })
    expect(Object.keys(errorsForStep(errors, 0))).toEqual([
      'title',
      'description',
      'category',
      'cuisine',
      'offerType',
      'photo',
    ])
    expect(Object.keys(errorsForStep(errors, 1))).toEqual(['stalls'])
    expect(Object.keys(errorsForStep(errors, 2))).toEqual(['startDate', 'endDate', 'terms'])
    expect(errorsForStep(errors, 3)).toEqual({})
    expect(firstStepWithErrors(errors)).toBe(0)
  })

  it('points at the first step still holding a problem', () => {
    expect(firstStepWithErrors(checkDeal(complete(), { ...ready, stallCount: 0 }))).toBe(1)
    expect(firstStepWithErrors(checkDeal({ ...complete(), terms: '' }, ready))).toBe(2)
    expect(firstStepWithErrors(checkDeal(complete(), ready))).toBeNull()
  })

  it('asks for the amount the chosen offer type needs', () => {
    expect(
      checkDeal({ ...complete(), offerType: 'PERCENT_OFF', discountPercent: 101 }, ready),
    ).toEqual({
      discountPercent: 'The discount must be between 1 and 100 percent.',
    })
    expect(checkDeal({ ...complete(), offerType: 'FIXED_PRICE' }, ready)).toEqual({
      priceDollars: 'Please enter the price.',
    })
  })

  it('builds a trimmed payload with amounts only for their offer type', () => {
    const stalls = [{ id: 's1', name: 'Kopi Kia', merchantName: 'Kopi Kia', address: '1 Road' }]
    expect(toNewDeal(complete(), stalls)).toEqual({
      title: 'Kopi',
      description: 'Two for one',
      category: 'DRINKS',
      cuisine: null,
      offerType: 'BUY_ONE_GET_ONE',
      discountPercent: null,
      priceCents: null,
      stallIds: ['s1'],
      startDate: '2026-11-04',
      endDate: '2026-11-30',
      terms: 'Dine-in only',
    })
    expect(
      toNewDeal({ ...complete(), offerType: 'FIXED_PRICE', priceDollars: 4.5 }, stalls).priceCents,
    ).toBe(450)
  })
})
