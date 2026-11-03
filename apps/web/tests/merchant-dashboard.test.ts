import type { MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ConfirmDialog from '@web/components/ConfirmDialog.vue'
import type { DealInput, MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import MerchantDashboardPage from '@web/pages/MerchantDashboardPage.vue'
import { chooseOption } from '@web-tests/support/select'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const merchantApi = vi.hoisted(() => ({
  getOutlets: vi.fn(),
  getDeals: vi.fn(),
  createDeal: vi.fn(),
  updateDeal: vi.fn(),
  endDeal: vi.fn(),
  deleteDeal: vi.fn(),
  savePhoto: vi.fn(),
}))

vi.mock('@web/modules/merchant/merchant-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/merchant/merchant-api')>()),
  ...merchantApi,
}))

const flashApi = vi.hoisted(() => ({ saveFlashDraft: vi.fn() }))
vi.mock('@web/modules/merchant/flash-drop-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/merchant/flash-drop-api')>()),
  ...flashApi,
}))

// Stands in for the Flash deals section: Edit sends a draft up, and the page reports saves here.
const flashSaved = vi.fn()
let editDraft: (drop: MerchantFlashDrop) => void = () => {}
const FlashDropsSectionStub = {
  emits: ['edit'],
  setup(
    _props: unknown,
    {
      emit,
      expose,
    }: {
      emit: (event: 'edit', drop: MerchantFlashDrop) => void
      expose: (exposed: object) => void
    },
  ) {
    editDraft = (drop) => emit('edit', drop)
    expose({ saved: flashSaved })
    return () => null
  },
}

enableAutoUnmount(afterEach)

// Labelled synthetic fixtures: none of these are real outlets or deals.
const outlet: MerchantOutlet = { id: 'a'.repeat(24), name: 'Synthetic Stall', address: '1 Fake St' }
const otherOutlet: MerchantOutlet = {
  id: 'c'.repeat(24),
  name: 'Synthetic Stall 2',
  address: '2 Fake St',
}

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
  flashApi.saveFlashDraft.mockImplementation(async (draft: MerchantFlashDrop | null) => ({
    ...(draft ?? flashDraft()),
    version: (draft?.version ?? 0) + 1,
  }))
})

// A synthetic flash deal draft, as the server returns it.
const flashDraft = (overrides: Partial<MerchantFlashDrop> = {}): MerchantFlashDrop => ({
  id: 'd'.repeat(24),
  dealId: 'e'.repeat(24),
  dealTitle: 'Synthetic flash rice',
  outletId: outlet.id,
  outletName: outlet.name,
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  flashPriceCents: 150,
  usualPriceCents: 400,
  startsAt: '2099-01-01T10:00:00.000Z',
  endsAt: '2099-01-01T10:30:00.000Z',
  codeValidity: 'END_OF_DAY',
  codesExpireAt: '2099-01-01T15:59:59.999Z',
  radiusMetres: 500,
  codeLimit: 40,
  claimedCount: 0,
  status: 'DRAFT',
  reviewNote: null,
  version: 1,
  demo: false,
  startsOnGoLive: true,
  deal: {
    title: 'Synthetic flash rice',
    description: 'Fake flash deal.',
    category: 'FOOD',
    cuisine: 'CHINESE',
    offerType: 'FIXED_PRICE',
    discountPercent: null,
    priceCents: 150,
    terms: '',
    photo: null,
  },
  ...overrides,
})

afterEach(() => {
  vi.clearAllMocks()
})

const mountPage = async () => {
  const wrapper = mount(MerchantDashboardPage, {
    global: {
      stubs: { FlashDropsSection: FlashDropsSectionStub, RouterLink: true, TicketLoading: true },
    },
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
  await chooseOption(wrapper, '#deal-category', 'FOOD')
  await chooseOption(wrapper, '#deal-cuisine', 'CHINESE')
  await chooseOption(wrapper, '#deal-offer', 'BUY_ONE_GET_ONE')
}

const save = async (wrapper: PageWrapper) => {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('merchant dashboard', () => {
  it('loads outlets and deals from the server, with no sample data anywhere', async () => {
    merchantApi.getDeals.mockResolvedValue([deal({ photo: savedPhoto })])
    const wrapper = await mountPage()

    expect(merchantApi.getOutlets).toHaveBeenCalledOnce()
    expect(merchantApi.getDeals).toHaveBeenCalledOnce()
    expect(wrapper.find('.alert-warning').exists()).toBe(false)
    expect(wrapper.find('.fake-badge').exists()).toBe(false)
    // Flash deals are made from the deal form now, not from a deal card.
    expect(wrapper.text()).not.toContain('Flash drop this')
    expect(wrapper.text()).toContain('Synthetic chicken rice')
    expect(wrapper.get('li img').attributes('src')).toBe(savedPhoto.url)
  })

  it('ends a live deal, and deletes scheduled and ended ones after a themed confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    // App.vue mounts the one ConfirmDialog for every page.
    mount(ConfirmDialog, { attachTo: document.body })
    merchantApi.deleteDeal.mockResolvedValue(undefined)
    merchantApi.endDeal.mockImplementation(async (id: string) =>
      deal({ id, title: 'Synthetic live', endedAt: '2026-11-03T00:00:00.000Z' }),
    )
    merchantApi.getDeals.mockResolvedValue([
      deal({ id: '1'.repeat(24), title: 'Synthetic live' }),
      deal({ id: '2'.repeat(24), title: 'Synthetic scheduled', startDate: '2099-01-01' }),
      deal({ id: '3'.repeat(24), title: 'Synthetic ended', endedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    const wrapper = await mountPage()
    const card = (title: string) => {
      const found = wrapper.findAll('.merchant-card').find((item) => item.text().includes(title))
      if (!found) throw new Error(`No card for ${title}`)
      return found
    }
    const labels = (title: string) =>
      card(title)
        .findAll('button')
        .map((item) => item.element.childNodes[0]?.textContent?.trim())
    expect(labels('Synthetic live')).toEqual(['Edit', 'End deal'])
    expect(labels('Synthetic scheduled')).toEqual(['Edit', 'Delete'])
    expect(labels('Synthetic ended')).toEqual(['Run it again', 'Delete'])

    // The app's own dialog asks first, never the browser's. Cancel changes nothing.
    await card('Synthetic scheduled').findAll('button')[1]?.trigger('click')
    await flushPromises()
    const dialog = () => document.querySelector('[data-testid="confirm-dialog"]')
    // Clicks a button in the confirm dialog, which is teleported to <body>.
    const press = (selector: string) => {
      const found = document.querySelector<HTMLButtonElement>(selector)
      if (!found) throw new Error(`No ${selector} in the confirm dialog`)
      found.click()
    }
    expect(dialog()?.textContent).toContain('Delete this deal?')
    expect(dialog()?.textContent).toContain('"Synthetic scheduled" will be removed from the map')
    press('.confirm-dialog__button--cancel')
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(merchantApi.deleteDeal).not.toHaveBeenCalled()

    await card('Synthetic scheduled').findAll('button')[1]?.trigger('click')
    await flushPromises()
    press('[data-testid="confirm-dialog-confirm"]')
    await flushPromises()
    expect(merchantApi.deleteDeal).toHaveBeenCalledWith('2'.repeat(24))
    expect(
      wrapper.findAll('.merchant-card').some((item) => item.text().includes('Synthetic scheduled')),
    ).toBe(false)
    expect(wrapper.text()).toContain('"Synthetic scheduled" was deleted.')

    await card('Synthetic live').findAll('button')[1]?.trigger('click')
    await flushPromises()
    expect(dialog()?.textContent).toContain('End this deal?')
    press('[data-testid="confirm-dialog-confirm"]')
    await flushPromises()
    expect(merchantApi.endDeal).toHaveBeenCalledWith('1'.repeat(24))
    expect(merchantApi.deleteDeal).toHaveBeenCalledTimes(1)
    expect(confirmSpy).not.toHaveBeenCalled()
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
  it('links to merchant access so a merchant can request another outlet', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('router-link-stub[to="/me/merchant-access"]').exists()).toBe(true)
  })

  it('runs an ended deal again as a new deal, without its dates or photo', async () => {
    const ended = deal({
      title: 'Synthetic Christmas set',
      offerType: 'FIXED_PRICE',
      priceCents: 450,
      startDate: '2025-12-01',
      endDate: '2025-12-31',
      endedAt: '2026-01-01T00:00:00.000Z',
      photo: savedPhoto,
    })
    merchantApi.getDeals.mockResolvedValue([ended])
    const wrapper = await mountPage()

    await button(wrapper, 'Run it again').trigger('click')
    expect(wrapper.get('form h2').text()).toBe('New deal')
    expect(wrapper.text()).toContain('Copied from "Synthetic Christmas set"')
    expect(wrapper.get<HTMLInputElement>('#deal-title').element.value).toBe(
      'Synthetic Christmas set',
    )
    expect(wrapper.get<HTMLInputElement>('#deal-price').element.value).toBe('4.5')
    expect(wrapper.get<HTMLInputElement>('#deal-start').element.value).toBe('')
    expect(wrapper.find('form img').exists()).toBe(false)
    await save(wrapper)

    expect(merchantApi.updateDeal).not.toHaveBeenCalled()
    expect(merchantApi.createDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Synthetic Christmas set',
        priceCents: 450,
        outletIds: [outlet.id],
        startDate: '',
        endDate: '',
        photoKey: null,
      }),
    )
  })

  it("saves as a flash deal draft at one outlet, without the deal's own dates", async () => {
    merchantApi.getOutlets.mockResolvedValue([outlet, otherOutlet])
    const wrapper = await mountPage()
    await fillNewDeal(wrapper)
    await wrapper.get(`#outlet-${outlet.id}`).setValue(true)
    await wrapper.get(`#outlet-${otherOutlet.id}`).setValue(true)

    // The first press shows the flash fields and keeps only the first outlet.
    await button(wrapper, 'Save as flash deal').trigger('click')
    expect(wrapper.get('form h2').text()).toBe('New flash deal')
    expect(wrapper.find('#deal-start').exists()).toBe(false)
    expect(wrapper.find('[data-testid="flash-preview"]').exists()).toBe(true)
    expect(flashSaved).not.toHaveBeenCalled()
    // The form's own offer is the flash offer, with the same choices as a deal.
    expect(wrapper.get('label[for="deal-offer"]').text()).toBe('Flash offer')
    await chooseOption(wrapper, '#deal-offer', 'FIXED_PRICE')
    expect(wrapper.get('label[for="deal-price"]').text()).toBe('Flash price ($)')
    await wrapper.get('#deal-price').setValue('1.5')

    await wrapper.get(`#outlet-${otherOutlet.id}`).setValue(true)
    await wrapper.get('#flash-usual').setValue('1')
    await save(wrapper)
    expect(wrapper.text()).toContain('A flash deal runs at one outlet. Choose just one.')
    expect(wrapper.text()).toContain(
      'The usual price has to be higher than the flash price of $1.50.',
    )
    expect(flashApi.saveFlashDraft).not.toHaveBeenCalled()

    await wrapper.get(`#outlet-${otherOutlet.id}`).setValue(false)
    await wrapper.get('#flash-usual').setValue('4')
    await save(wrapper)
    expect(merchantApi.createDeal).not.toHaveBeenCalled()
    expect(flashApi.saveFlashDraft).toHaveBeenCalledWith(null, {
      title: 'Synthetic 1-for-1',
      description: 'Two plates for one.',
      category: 'FOOD',
      cuisine: 'CHINESE',
      offerType: 'FIXED_PRICE',
      discountPercent: null,
      priceCents: 150,
      usualPriceCents: 400,
      terms: '',
      photoKey: null,
      outletId: outlet.id,
      startsAt: null,
      durationMinutes: 30,
      codeValidity: 'END_OF_DAY',
      radiusMetres: 500,
      codeLimit: 40,
    })
    expect(flashSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }), true)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('saves a 1-for-1 flash deal with no price', async () => {
    const wrapper = await mountPage()
    await fillNewDeal(wrapper)
    await button(wrapper, 'Save as flash deal').trigger('click')
    expect(wrapper.find('#flash-usual').exists()).toBe(false)
    expect(wrapper.get('[data-testid="flash-preview"]').text()).toContain(
      '1-for-1 Synthetic 1-for-1',
    )
    await save(wrapper)
    expect(flashApi.saveFlashDraft).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        offerType: 'BUY_ONE_GET_ONE',
        priceCents: null,
        discountPercent: null,
        usualPriceCents: null,
      }),
    )
  })

  it('can turn the flash deal back into an ordinary deal before saving', async () => {
    const wrapper = await mountPage()
    await fillNewDeal(wrapper)
    await button(wrapper, 'Save as flash deal').trigger('click')
    await button(wrapper, 'Make it an ordinary deal').trigger('click')
    expect(wrapper.find('[data-testid="flash-preview"]').exists()).toBe(false)
    expect(wrapper.get('label[for="deal-offer"]').text()).toBe('Offer type')
    await save(wrapper)
    expect(merchantApi.createDeal).toHaveBeenCalledOnce()
    expect(flashApi.saveFlashDraft).not.toHaveBeenCalled()
  })

  it('opens a flash deal draft in the form and saves changes to it', async () => {
    const wrapper = await mountPage()
    const draft = flashDraft()
    editDraft(draft)
    await flushPromises()
    expect(wrapper.get('form h2').text()).toBe('Edit flash deal draft')
    expect(wrapper.get<HTMLInputElement>('#deal-title').element.value).toBe('Synthetic flash rice')
    expect(wrapper.get<HTMLInputElement>('#deal-price').element.value).toBe('1.5')
    expect(wrapper.get<HTMLInputElement>('#flash-usual').element.value).toBe('4')
    expect(wrapper.text()).not.toContain('Make it an ordinary deal')

    await wrapper.get('#deal-title').setValue('Synthetic duck rice')
    await save(wrapper)
    expect(flashApi.saveFlashDraft).toHaveBeenCalledWith(
      draft,
      expect.objectContaining({ title: 'Synthetic duck rice', outletId: outlet.id }),
    )
    expect(flashSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }), false)
  })
})
