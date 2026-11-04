import type {
  CatalogueMerchant,
  CatalogueVenueDetail,
} from '@broke-oclock/contracts/admin-catalogue'
import { flushPromises, mount } from '@vue/test-utils'
import { readiness } from '@web/modules/admin-catalogue/catalogue-labels'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ingestion = vi.hoisted(() => ({ searchLocations: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({ api: { ingestion, adminCatalogue: {} } }))

const merchant: CatalogueMerchant = {
  id: '111111111111111111111111',
  name: 'Synthetic Kopi',
  version: 3,
  archived: false,
  venueCount: 1,
  dealCount: 2,
}
const venue: CatalogueVenueDetail = {
  id: '333333333333333333333333',
  merchantId: merchant.id,
  merchantName: merchant.name,
  parentArchived: false,
  name: 'Synthetic Kopi, Tampines Mall',
  address: '4 Tampines Central 5, #B1-21',
  postalCode: '529510',
  area: 'Tampines',
  latitude: 1.3526,
  longitude: 103.9447,
  imageUrl: null,
  geographyPrecision: 'PROPERTY',
  catalogueKey: 'database:abc',
  version: 4,
  archived: false,
  selectable: false,
  geographyVerified: true,
  occupancyVerified: false,
  geographyState: 'VERIFIED',
  occupancyState: 'UNVERIFIED',
  dealCount: 2,
  grantCount: 0,
  requestCount: 0,
  evidence: [
    {
      id: '444444444444444444444444',
      kind: 'GEOGRAPHY',
      subjectHash: 'hash',
      provider: 'ONEMAP',
      reference: 'OneMap search for 529510',
      sourceUrl: 'https://www.onemap.gov.sg/',
      statement: 'Postal code lands on Tampines Mall',
      observedAt: null,
      recordedAt: '2026-10-28T03:12:00.000Z',
      catalogueVersion: 4,
      actorName: 'Synthetic admin',
    },
  ],
  evidenceTruncated: false,
}
const buttonByText = (wrapper: ReturnType<typeof mount>, text: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Missing button ${text}`)
  return button
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('readiness', () => {
  it('names what blocks deals, in the order to fix it', () => {
    expect(readiness(venue)).toMatchObject({ tone: 'blocked', title: 'Not ready for deals' })
    expect(readiness({ ...venue, selectable: true, occupancyVerified: true }).tone).toBe('ready')
    expect(
      readiness({ ...venue, selectable: true, occupancyVerified: true, geographyVerified: false }),
    ).toMatchObject({ tone: 'partial', title: 'Deals can pick this outlet' })
    expect(readiness({ ...venue, geographyPrecision: 'UNKNOWN' }).detail).toContain('precision')
    expect(readiness({ ...venue, archived: true }).title).toBe('Archived')
  })
})

describe('OutletDetail', () => {
  it('leads with the missing check and records it with one confirmation', async () => {
    const { default: OutletDetail } = await import('@web/modules/admin-catalogue/OutletDetail.vue')
    const wrapper = mount(OutletDetail, { props: { venue, disabled: false, pending: false } })
    expect(wrapper.text()).toContain('Not ready for deals')
    expect(wrapper.text()).toContain('OneMap · ')
    const verify = buttonByText(wrapper, 'Verify occupancy')
    expect(verify.classes()).toContain('btn-primary')
    expect(wrapper.findAll('button').some((button) => button.text() === 'Verify location')).toBe(
      false,
    )
    await verify.trigger('click')
    // OneMap proves a building, not who trades there, so it is not offered for occupancy.
    expect(wrapper.find('input[value="ONEMAP"]').exists()).toBe(false)
    await wrapper.get('[name="reference"]').setValue('Store locator page')
    await wrapper.get('[name="statement"]').setValue('Lists this outlet')
    await wrapper.get('[name="note"]').setValue('First check')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('record')?.[0]?.[0]).toEqual({
      kind: 'OCCUPANCY',
      sourceType: 'OFFICIAL_MERCHANT',
      reference: 'Store locator page',
      statement: 'Lists this outlet',
      note: 'First check',
      reviewedSource: true,
      confirmed: true,
    })
    wrapper.unmount()
  })

  it('withdraws a verified check only after a reason and confirmation', async () => {
    const { default: OutletDetail } = await import('@web/modules/admin-catalogue/OutletDetail.vue')
    const wrapper = mount(OutletDetail, { props: { venue, disabled: false, pending: false } })
    await buttonByText(wrapper, 'Withdraw').trigger('click')
    expect(buttonByText(wrapper, 'Withdraw check').attributes('disabled')).toBeDefined()
    await wrapper.get('[name="note"]').setValue('Moved out')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('withdraw')?.[0]?.[0]).toEqual({
      kind: 'GEOGRAPHY',
      note: 'Moved out',
      confirmed: true,
    })
    wrapper.unmount()
  })

  it('locks every action while the outlet is locked', async () => {
    const { default: OutletDetail } = await import('@web/modules/admin-catalogue/OutletDetail.vue')
    const wrapper = mount(OutletDetail, { props: { venue, disabled: true, pending: false } })
    for (const text of ['Verify occupancy', 'Edit details', 'Archive outlet'])
      expect(buttonByText(wrapper, text).attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

describe('VenueEditor', () => {
  it('fills a new outlet from a OneMap match and creates it with a generated key', async () => {
    ingestion.searchLocations.mockResolvedValue({
      items: [
        {
          searchValue: 'TAMPINES MALL',
          address: '4 TAMPINES CENTRAL 5 TAMPINES MALL SINGAPORE 529510',
          postalCode: '529510',
          latitude: 1.3526,
          longitude: 103.9447,
        },
      ],
    })
    const { default: VenueEditor } = await import('@web/modules/admin-catalogue/VenueEditor.vue')
    const wrapper = mount(VenueEditor, { props: { parent: merchant, disabled: false } })
    await wrapper.get('#address-lookup').setValue('529510')
    await wrapper.get('form.catalogue-lookup-form').trigger('submit')
    await flushPromises()
    expect(ingestion.searchLocations).toHaveBeenCalledWith({ query: '529510' })
    await wrapper.get('.catalogue-candidate').trigger('click')
    expect(wrapper.get<HTMLInputElement>('[name="name"]').element.value).toBe(
      'Synthetic Kopi, Tampines Mall',
    )
    await wrapper.get('[name="area"]').setValue('Tampines')
    await wrapper.get('[name="note"]').setValue('New outlet')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('form:has([name="catalogueKey"])').trigger('submit')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      name: 'Synthetic Kopi, Tampines Mall',
      address: '4 Tampines Central 5 Tampines Mall',
      postalCode: '529510',
      area: 'Tampines',
      latitude: 1.3526,
      longitude: 103.9447,
      geographyPrecision: 'PROPERTY',
      catalogueKey: 'admin:synthetic-kopi-529510',
      note: 'New outlet',
      confirmed: true,
    })
    wrapper.unmount()
  })

  it('falls back to typing when OneMap is not set up', async () => {
    ingestion.searchLocations.mockRejectedValue({ code: 'PRECONDITION_FAILED' })
    const { default: VenueEditor } = await import('@web/modules/admin-catalogue/VenueEditor.vue')
    const wrapper = mount(VenueEditor, { props: { parent: merchant, disabled: false } })
    await wrapper.get('#address-lookup').setValue('529510')
    await wrapper.get('form.catalogue-lookup-form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('OneMap isn’t set up on this server')
    expect(wrapper.find('[name="address"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('reviews only what changed and warns when proof will be reset', async () => {
    const { default: VenueEditor } = await import('@web/modules/admin-catalogue/VenueEditor.vue')
    const wrapper = mount(VenueEditor, { props: { venue, disabled: false } })
    expect(wrapper.find('[name="note"]').exists()).toBe(false)
    await wrapper.get('[name="imageUrl"]').setValue('https://example.test/photo.jpg')
    expect(wrapper.text()).toContain('Image URL')
    expect(wrapper.text()).not.toContain('resets this outlet’s verification')
    await wrapper.get('[name="address"]').setValue('4 Tampines Central 5, #B1-22')
    expect(wrapper.text()).toContain('resets this outlet’s verification')
    await wrapper.get('[name="note"]').setValue('Unit moved')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('form:has([name="catalogueKey"])').trigger('submit')
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({
      address: '4 Tampines Central 5, #B1-22',
      imageUrl: 'https://example.test/photo.jpg',
      note: 'Unit moved',
      confirmed: true,
    })
    wrapper.unmount()
  })
})
