import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { DealInput, MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import MerchantDashboardPage from '@web/pages/MerchantDashboardPage.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const merchantApi = vi.hoisted(() => ({
  getOutlets: vi.fn(),
  getDeals: vi.fn(),
  createDeal: vi.fn(),
  updateDeal: vi.fn(),
  savePhoto: vi.fn(),
}))

vi.mock('@web/modules/merchant/merchant-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/merchant/merchant-api')>()),
  ...merchantApi,
}))

enableAutoUnmount(afterEach)

// Labelled synthetic fixtures: none of these are real outlets or deals.
const outlet: MerchantOutlet = { id: 'a'.repeat(24), name: 'Synthetic Stall', address: '1 Fake St' }

const deal = (overrides: Partial<MerchantDeal> = {}): MerchantDeal => ({
  id: 'b'.repeat(24),
  title: 'Synthetic chicken rice',
  description: 'Fake deal for tests.',
  category: 'FOOD',
  cuisine: 'CHINESE',
  outletIds: [outlet.id],
  offerType: 'BUY_ONE_GET_ONE',
  discountPercent: null,
  priceCents: null,
  startDate: '',
  endDate: '',
  terms: '',
  endedAt: null,
  photo: null,
  ...overrides,
})

const savedPhoto = { key: 'synthetic-saved-key', url: 'https://synthetic.example.test/saved.webp' }

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:synthetic-merchant-preview'),
  })
  merchantApi.getOutlets.mockResolvedValue([outlet])
  merchantApi.getDeals.mockResolvedValue([])
  // Like the server: the saved deal carries the photo its key names, or none.
  const saved = ({ photoKey, ...input }: DealInput, id = 'b'.repeat(24)) =>
    deal({
      ...input,
      id,
      photo: photoKey ? { key: photoKey, url: `https://synthetic.example.test/${photoKey}` } : null,
    })
  merchantApi.createDeal.mockImplementation(async (input: DealInput) => saved(input))
  merchantApi.updateDeal.mockImplementation(async (id: string, input: DealInput) =>
    saved(input, id),
  )
  merchantApi.savePhoto.mockResolvedValue('synthetic-new-key')
})

afterEach(() => {
  vi.clearAllMocks()
})

const mountPage = async () => {
  const wrapper = mount(MerchantDashboardPage, {
    global: { stubs: { FlashDropsSection: true, RouterLink: true, TicketLoading: true } },
  })
  await flushPromises()
  return wrapper
}
type PageWrapper = Awaited<ReturnType<typeof mountPage>>

const button = (wrapper: PageWrapper, text: string) => {
  const found = wrapper.findAll('button').find((item) => item.text().startsWith(text))
  if (!found) throw new Error(`No "${text}" button`)
  return found
}

async function selectPhoto(wrapper: PageWrapper, file: File) {
  const input = wrapper.get<HTMLInputElement>('#deal-photo')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}

async function fillNewDeal(wrapper: PageWrapper) {
  await button(wrapper, '+ New deal').trigger('click')
  await wrapper.get('#deal-title').setValue('Synthetic 1-for-1')
  await wrapper.get('#deal-description').setValue('Two plates for one.')
  await wrapper.get('#deal-category').setValue('FOOD')
  await wrapper.get('#deal-cuisine').setValue('CHINESE')
  await wrapper.get('#deal-offer').setValue('BUY_ONE_GET_ONE')
}

const save = async (wrapper: PageWrapper) => {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('merchant dashboard', () => {
  it('loads outlets and deals from the server; only flash drops are marked as fake', async () => {
    merchantApi.getDeals.mockResolvedValue([deal({ photo: savedPhoto })])
    const wrapper = await mountPage()

    expect(merchantApi.getOutlets).toHaveBeenCalledOnce()
    expect(merchantApi.getDeals).toHaveBeenCalledOnce()
    expect(wrapper.get('.alert-warning').text()).toContain('Your deals are real')
    expect(wrapper.find('.fake-badge').exists()).toBe(false)
    expect(wrapper.text()).toContain('Synthetic chicken rice')
    expect(wrapper.get('li img').attributes('src')).toBe(savedPhoto.url)
  })

  it('saves a new deal without a photo, since the photo is optional', async () => {
    const wrapper = await mountPage()
    await fillNewDeal(wrapper)
    await save(wrapper)

    expect(merchantApi.savePhoto).not.toHaveBeenCalled()
    expect(merchantApi.createDeal).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Synthetic 1-for-1', photoKey: null }),
    )
    expect(wrapper.text()).toContain('"Synthetic 1-for-1" is now live.')
  })

  it('uploads a chosen photo first and saves the deal with its key', async () => {
    const wrapper = await mountPage()
    await fillNewDeal(wrapper)
    const file = new File(['image'], 'promo.png', { type: 'image/png' })
    await selectPhoto(wrapper, file)
    expect(wrapper.get('form img').attributes('src')).toBe('blob:synthetic-merchant-preview')
    await save(wrapper)

    expect(merchantApi.savePhoto).toHaveBeenCalledWith(file)
    expect(merchantApi.createDeal).toHaveBeenCalledWith(
      expect.objectContaining({ photoKey: 'synthetic-new-key' }),
    )
  })

  it('rejects photos of the wrong type or over 4 MB', async () => {
    const wrapper = await mountPage()
    await fillNewDeal(wrapper)
    await selectPhoto(wrapper, new File(['gif'], 'promo.gif', { type: 'image/gif' }))
    expect(wrapper.get('#error-photo').text()).toBe('Please choose a JPEG, PNG or WebP image.')

    const large = new File(['image'], 'large.png', { type: 'image/png' })
    Object.defineProperty(large, 'size', { value: 4 * 1024 * 1024 + 1 })
    await selectPhoto(wrapper, large)
    expect(wrapper.get('#error-photo').text()).toBe('The image must be 4 MB or smaller.')
    expect(wrapper.find('form img').exists()).toBe(false)
  })

  it('keeps, replaces or removes the saved photo when editing', async () => {
    merchantApi.getDeals.mockResolvedValue([deal({ photo: savedPhoto })])
    const wrapper = await mountPage()

    // Untouched: the saved photo's key is sent back, so the server keeps it.
    await button(wrapper, 'Edit').trigger('click')
    expect(wrapper.get('form img').attributes('src')).toBe(savedPhoto.url)
    await save(wrapper)
    expect(merchantApi.updateDeal).toHaveBeenLastCalledWith(
      'b'.repeat(24),
      expect.objectContaining({ photoKey: savedPhoto.key }),
    )
    expect(merchantApi.savePhoto).not.toHaveBeenCalled()

    // Replaced: the new photo is uploaded and its key sent instead.
    await button(wrapper, 'Edit').trigger('click')
    await selectPhoto(wrapper, new File(['image'], 'new.webp', { type: 'image/webp' }))
    await save(wrapper)
    expect(merchantApi.updateDeal).toHaveBeenLastCalledWith(
      'b'.repeat(24),
      expect.objectContaining({ photoKey: 'synthetic-new-key' }),
    )

    // Removed: no photo is sent at all.
    await button(wrapper, 'Edit').trigger('click')
    await button(wrapper, 'Remove photo').trigger('click')
    expect(wrapper.find('form img').exists()).toBe(false)
    await save(wrapper)
    expect(merchantApi.updateDeal).toHaveBeenLastCalledWith(
      'b'.repeat(24),
      expect.objectContaining({ photoKey: null }),
    )
  })

  it('keeps the form open and explains when the photo upload fails', async () => {
    merchantApi.savePhoto.mockRejectedValue(new Error('PHOTO_UPLOAD_FAILED'))
    const wrapper = await mountPage()
    await fillNewDeal(wrapper)
    await selectPhoto(wrapper, new File(['image'], 'promo.png', { type: 'image/png' }))
    await save(wrapper)

    expect(merchantApi.createDeal).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).toContain('Could not upload the photo. Please try again.')
  })
})
