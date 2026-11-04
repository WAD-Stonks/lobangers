import type { MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ConfirmDialog from '@web/components/ConfirmDialog.vue'
import type { DealInput, MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import { merchantRoutes } from '@web/router/merchant-routes'
import { chooseOption } from '@web-tests/support/select'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw, RouterView } from 'vue-router'

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

const flashApi = vi.hoisted(() => ({ saveFlashDraft: vi.fn(), getFlashDrops: vi.fn() }))
vi.mock('@web/modules/merchant/flash-drop-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/merchant/flash-drop-api')>()),
  ...flashApi,
}))

// Signed out as far as live updates go, so the dashboard never opens a push channel.
vi.mock('@web/lib/auth-client', () => ({
  authClient: { useSession: () => ref({ data: null, isPending: false }) },
}))

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

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:synthetic-merchant-preview'),
  })
  merchantApi.getOutlets.mockResolvedValue([outlet])
  merchantApi.getDeals.mockResolvedValue([])
  flashApi.getFlashDrops.mockResolvedValue([])
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

afterEach(() => {
  vi.clearAllMocks()
})

// The app's real merchant routes, plus plain pages for the links that leave them.
const Blank = defineComponent({ render: () => h('p', 'Somewhere else') })
const testRoutes: RouteRecordRaw[] = [
  ...merchantRoutes,
  { path: '/deals', component: Blank },
  { path: '/me/merchant-access', component: Blank },
]

// Opens the app at a path, with the router running as it does in the browser.
const openAt = async (path: string) => {
  const router = createRouter({ history: createMemoryHistory(), routes: testRoutes })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router], stubs: { TicketLoading: true } },
  })
  await flushPromises()
  return { wrapper, router }
}
type PageWrapper = Awaited<ReturnType<typeof openAt>>['wrapper']

// Opening a page loads its code on demand, which can take a while when every suite runs at once.
const PAGE_LOAD = { timeout: 5000 }

const button = (wrapper: PageWrapper, text: string) => {
  const found = wrapper.findAll('button').find((item) => item.text().startsWith(text))
  if (!found) throw new Error(`No "${text}" button`)
  return found
}

const card = (wrapper: PageWrapper, title: string) => {
  const found = wrapper.findAll('.merchant-card').find((item) => item.text().includes(title))
  if (!found) throw new Error(`No card for ${title}`)
  return found
}

async function selectPhoto(wrapper: PageWrapper, file: File) {
  const input = wrapper.get<HTMLInputElement>('#deal-photo')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}

async function fillNewDeal(wrapper: PageWrapper) {
  await wrapper.get('#deal-title').setValue('Synthetic 1-for-1')
  await wrapper.get('#deal-description').setValue('Two plates for one.')
  await chooseOption(wrapper, '#deal-category', 'FOOD')
  await chooseOption(wrapper, '#deal-cuisine', 'CHINESE')
  await wrapper.get('[data-testid="merchant-offer-BUY_ONE_GET_ONE"]').setValue(true)
}

// The form is in four steps; each submit (Enter, or Next) checks the step and opens the next,
// and a submit on the last step, the review, saves.
const submit = async (wrapper: PageWrapper) => {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
const FORM_STEPS = 4
const toReview = async (wrapper: PageWrapper) => {
  for (let index = 1; index < FORM_STEPS; index++) await submit(wrapper)
}
// Steps through to the review and saves; a step with a problem stops it there, and a save that
// goes back to the dashboard ends it.
const save = async (wrapper: PageWrapper) => {
  for (let index = 0; index < FORM_STEPS && wrapper.find('form').exists(); index++)
    await submit(wrapper)
}

// Clicks a button in the app's confirm dialog, which is teleported to <body>.
const dialog = () => document.querySelector('[data-testid="confirm-dialog"]')
const press = (selector: string) => {
  const found = document.querySelector<HTMLButtonElement>(selector)
  if (!found) throw new Error(`No ${selector} in the confirm dialog`)
  found.click()
}

describe('merchant dashboard', () => {
  it('loads outlets, deals and flash deals from the server, with no sample data anywhere', async () => {
    merchantApi.getDeals.mockResolvedValue([deal({ photo: savedPhoto })])
    const { wrapper } = await openAt('/merchant')

    expect(merchantApi.getOutlets).toHaveBeenCalledOnce()
    expect(merchantApi.getDeals).toHaveBeenCalledOnce()
    expect(flashApi.getFlashDrops).toHaveBeenCalledOnce()
    expect(wrapper.find('.fake-badge').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Merchant dashboard')
    expect(wrapper.text()).toContain('Synthetic chicken rice')
    expect(wrapper.get('li img').attributes('src')).toBe(savedPhoto.url)
  })

  it('sums up live, coming-up and flash deals in the stats', async () => {
    merchantApi.getDeals.mockResolvedValue([
      deal({ id: '1'.repeat(24), title: 'Synthetic live' }),
      deal({ id: '2'.repeat(24), title: 'Synthetic live 2' }),
      deal({ id: '3'.repeat(24), title: 'Synthetic scheduled', startDate: '2099-01-01' }),
    ])
    flashApi.getFlashDrops.mockResolvedValue([
      flashDraft({ id: '4'.repeat(24) }),
      flashDraft({
        id: '5'.repeat(24),
        dealTitle: 'Synthetic laksa',
        status: 'LIVE',
        claimedCount: 7,
        codeLimit: 20,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 12 * 60_000).toISOString(),
      }),
    ])
    const { wrapper } = await openAt('/merchant')

    expect(wrapper.get('[data-testid="stat-live"]').text()).toContain('2')
    expect(wrapper.get('[data-testid="stat-coming-up"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="stat-coming-up"]').text()).toContain('1 flash draft')
    expect(wrapper.get('[data-testid="stat-flash"]').text()).toContain('Flash deal live')
    expect(wrapper.get('[data-testid="stat-flash"]').text()).toContain('Synthetic laksa')
    expect(wrapper.get('[data-testid="stat-flash"]').text()).toContain('min left to claim')
    expect(wrapper.get('[data-testid="stat-codes"]').text()).toContain('7 / 20')
  })

  it('says when no flash deal is running and offers to start one', async () => {
    const { wrapper, router } = await openAt('/merchant')
    expect(wrapper.get('[data-testid="stat-flash"]').text()).toContain('None running')
    await button(wrapper, 'Start a flash deal').trigger('click')
    await vi.waitFor(
      () => expect(router.currentRoute.value.name).toBe('merchant-flash-new'),
      PAGE_LOAD,
    )
  })

  it('shows deals, flash deals and ended deals in tabs kept in the address', async () => {
    merchantApi.getDeals.mockResolvedValue([
      deal({ id: '1'.repeat(24), title: 'Synthetic live' }),
      deal({ id: '2'.repeat(24), title: 'Synthetic scheduled', startDate: '2099-01-01' }),
      deal({ id: '3'.repeat(24), title: 'Synthetic ended', endedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    const { wrapper, router } = await openAt('/merchant')
    const shownCards = () => wrapper.findAll('.merchant-card').filter((item) => item.isVisible())
    const titles = () => shownCards().map((item) => item.get('h4').text())

    expect(wrapper.get('[data-testid="tab-deals"]').attributes('aria-selected')).toBe('true')
    expect(titles()).toEqual(['Synthetic live', 'Synthetic scheduled'])
    await wrapper.get('[data-testid="filter-scheduled"]').trigger('click')
    expect(titles()).toEqual(['Synthetic scheduled'])

    await wrapper.get('[data-testid="tab-ended"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('ended')
    expect(titles()).toEqual(['Synthetic ended'])

    await wrapper.get('[data-testid="tab-flash"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('flash')
    expect(wrapper.text()).toContain('No drafts.')
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
    const { wrapper } = await openAt('/merchant')
    const labels = (title: string) =>
      card(wrapper, title)
        .findAll('button')
        .map((item) => item.element.childNodes[0]?.textContent?.trim())
    expect(labels('Synthetic live')).toEqual(['Edit', 'End deal'])
    expect(labels('Synthetic scheduled')).toEqual(['Edit', 'Delete'])

    // The app's own dialog asks first, never the browser's. Cancel changes nothing.
    await card(wrapper, 'Synthetic scheduled').findAll('button')[1]?.trigger('click')
    await flushPromises()
    expect(dialog()?.textContent).toContain('Delete this deal?')
    expect(dialog()?.textContent).toContain('"Synthetic scheduled" will be removed from the map')
    press('.confirm-dialog__button--cancel')
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(merchantApi.deleteDeal).not.toHaveBeenCalled()

    await card(wrapper, 'Synthetic scheduled').findAll('button')[1]?.trigger('click')
    await flushPromises()
    press('[data-testid="confirm-dialog-confirm"]')
    await flushPromises()
    expect(merchantApi.deleteDeal).toHaveBeenCalledWith('2'.repeat(24))
    expect(
      wrapper.findAll('.merchant-card').some((item) => item.text().includes('Synthetic scheduled')),
    ).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toContain('"Synthetic scheduled" was deleted.')

    await card(wrapper, 'Synthetic live').findAll('button')[1]?.trigger('click')
    await flushPromises()
    expect(dialog()?.textContent).toContain('End this deal?')
    press('[data-testid="confirm-dialog-confirm"]')
    await flushPromises()
    expect(merchantApi.endDeal).toHaveBeenCalledWith('1'.repeat(24))

    // The ended deal moves to the Ended tab, where it can run again or be deleted.
    await wrapper.get('[data-testid="tab-ended"]').trigger('click')
    await flushPromises()
    expect(labels('Synthetic ended')).toEqual(['Run it again', 'Delete'])
    expect(merchantApi.deleteDeal).toHaveBeenCalledTimes(1)
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('opens each form on its own address', async () => {
    merchantApi.getDeals.mockResolvedValue([
      deal({ id: '1'.repeat(24), title: 'Synthetic live' }),
      deal({ id: '3'.repeat(24), title: 'Synthetic ended', endedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    flashApi.getFlashDrops.mockResolvedValue([flashDraft()])
    const { wrapper, router } = await openAt('/merchant')

    await button(wrapper, 'Add a deal').trigger('click')
    await vi.waitFor(
      () => expect(router.currentRoute.value.fullPath).toBe('/merchant/deals/new'),
      PAGE_LOAD,
    )
    await router.push('/merchant')
    await flushPromises()

    await button(wrapper, 'New flash deal').trigger('click')
    await vi.waitFor(
      () => expect(router.currentRoute.value.fullPath).toBe('/merchant/flash/new'),
      PAGE_LOAD,
    )
    await router.push('/merchant')
    await flushPromises()

    await card(wrapper, 'Synthetic live').get('button').trigger('click')
    await vi.waitFor(
      () =>
        expect(router.currentRoute.value.fullPath).toBe(`/merchant/deals/${'1'.repeat(24)}/edit`),
      PAGE_LOAD,
    )
    await router.push('/merchant?tab=ended')
    await flushPromises()

    await button(wrapper, 'Run it again').trigger('click')
    await vi.waitFor(
      () =>
        expect(router.currentRoute.value.fullPath).toBe(
          `/merchant/deals/${'3'.repeat(24)}/run-again`,
        ),
      PAGE_LOAD,
    )
    await router.push('/merchant?tab=flash')
    await flushPromises()

    await card(wrapper, 'Synthetic flash rice').findAll('button')[1]?.trigger('click')
    await vi.waitFor(
      () =>
        expect(router.currentRoute.value.fullPath).toBe(`/merchant/flash/${'d'.repeat(24)}/edit`),
      PAGE_LOAD,
    )
  })

  it('links to merchant access so a merchant can request another outlet', async () => {
    const { wrapper } = await openAt('/merchant')
    expect(wrapper.find('a[href="/me/merchant-access"]').exists()).toBe(true)
  })

  it('asks for outlet access when the merchant has none yet', async () => {
    merchantApi.getOutlets.mockResolvedValue([])
    const { wrapper } = await openAt('/merchant')
    expect(wrapper.text()).toContain("You don't manage any outlets yet")
    expect(wrapper.text()).not.toContain('Add a deal')
  })
})

describe('merchant deal form', () => {
  it('saves a new deal without a photo and shows it on the dashboard', async () => {
    const { wrapper, router } = await openAt('/merchant/deals/new')
    expect(wrapper.get('h1').text()).toBe('New deal')
    await fillNewDeal(wrapper)
    await save(wrapper)

    expect(merchantApi.savePhoto).not.toHaveBeenCalled()
    expect(merchantApi.createDeal).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Synthetic 1-for-1', photoKey: null }),
    )
    // Back on the dashboard, with no "unsaved changes" question on the way.
    expect(router.currentRoute.value.name).toBe('merchant')
    expect(dialog()).toBeNull()
    expect(wrapper.get('[role="status"]').text()).toContain('"Synthetic 1-for-1" is now live.')
  })

  it('uploads a chosen photo first and saves the deal with its key', async () => {
    const { wrapper } = await openAt('/merchant/deals/new')
    await fillNewDeal(wrapper)
    const file = new File(['image'], 'promo.png', { type: 'image/png' })
    await selectPhoto(wrapper, file)
    expect(wrapper.get('form img.add-deal__preview').attributes('src')).toBe(
      'blob:synthetic-merchant-preview',
    )
    await save(wrapper)

    expect(merchantApi.savePhoto).toHaveBeenCalledWith(file)
    expect(merchantApi.createDeal).toHaveBeenCalledWith(
      expect.objectContaining({ photoKey: 'synthetic-new-key' }),
    )
  })

  it('rejects photos of the wrong type or over 4 MB', async () => {
    const { wrapper } = await openAt('/merchant/deals/new')
    await fillNewDeal(wrapper)
    await selectPhoto(wrapper, new File(['gif'], 'promo.gif', { type: 'image/gif' }))
    expect(wrapper.get('#error-photo').text()).toBe('Please choose a JPEG, PNG or WebP image.')

    const large = new File(['image'], 'large.png', { type: 'image/png' })
    Object.defineProperty(large, 'size', { value: 4 * 1024 * 1024 + 1 })
    await selectPhoto(wrapper, large)
    expect(wrapper.get('#error-photo').text()).toBe('The image must be 4 MB or smaller.')
    expect(wrapper.find('form img.add-deal__preview').exists()).toBe(false)
  })

  it('keeps, replaces or removes the saved photo when editing', async () => {
    merchantApi.getDeals.mockResolvedValue([deal({ photo: savedPhoto })])
    const editPath = `/merchant/deals/${'b'.repeat(24)}/edit`

    // Untouched: the saved photo's key is sent back, so the server keeps it.
    let { wrapper } = await openAt(editPath)
    expect(wrapper.get('h1').text()).toBe('Edit deal')
    expect(wrapper.get('form img.add-deal__preview').attributes('src')).toBe(savedPhoto.url)
    await save(wrapper)
    expect(merchantApi.updateDeal).toHaveBeenLastCalledWith(
      'b'.repeat(24),
      expect.objectContaining({ photoKey: savedPhoto.key }),
    )
    expect(merchantApi.savePhoto).not.toHaveBeenCalled()

    // Replaced: the new photo is uploaded and its key sent instead.
    ;({ wrapper } = await openAt(editPath))
    await selectPhoto(wrapper, new File(['image'], 'new.webp', { type: 'image/webp' }))
    await save(wrapper)
    expect(merchantApi.updateDeal).toHaveBeenLastCalledWith(
      'b'.repeat(24),
      expect.objectContaining({ photoKey: 'synthetic-new-key' }),
    )

    // Removed: no photo is sent at all.
    ;({ wrapper } = await openAt(editPath))
    await button(wrapper, 'Remove photo').trigger('click')
    expect(wrapper.find('form img.add-deal__preview').exists()).toBe(false)
    await save(wrapper)
    expect(merchantApi.updateDeal).toHaveBeenLastCalledWith(
      'b'.repeat(24),
      expect.objectContaining({ photoKey: null }),
    )
  })

  it('says so when the deal to edit is gone', async () => {
    const { wrapper } = await openAt(`/merchant/deals/${'9'.repeat(24)}/edit`)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('We could not find that deal.')
  })

  it('keeps the form open and explains when the photo upload fails', async () => {
    merchantApi.savePhoto.mockRejectedValue(new Error('PHOTO_UPLOAD_FAILED'))
    const { wrapper, router } = await openAt('/merchant/deals/new')
    await fillNewDeal(wrapper)
    await selectPhoto(wrapper, new File(['image'], 'promo.png', { type: 'image/png' }))
    await save(wrapper)

    expect(merchantApi.createDeal).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('merchant-deal-new')
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).toContain('Could not upload the photo. Please try again.')
  })

  it('walks a new deal through the same four steps as Add a deal, checking each one', async () => {
    const { wrapper } = await openAt('/merchant/deals/new')
    const current = () => wrapper.get('[aria-current="step"]').text()
    expect(current()).toContain('Deal details')
    // A step with a problem stays open; later steps cannot be opened from the stepper yet.
    await submit(wrapper)
    expect(current()).toContain('Deal details')
    expect(wrapper.text()).toContain('Please give the deal a title.')
    expect(wrapper.get('[data-testid="step-review"]').attributes('disabled')).toBeDefined()

    await fillNewDeal(wrapper)
    await submit(wrapper)
    expect(current()).toContain('Outlets')
    await submit(wrapper)
    expect(current()).toContain('Validity')
    await submit(wrapper)
    expect(current()).toContain('Review')
    expect(wrapper.text()).toContain('Synthetic 1-for-1')
    expect(merchantApi.createDeal).not.toHaveBeenCalled()

    // Edit on the review reopens that step.
    await wrapper.get('[data-testid="merchant-review-edit-0"]').trigger('click')
    await flushPromises()
    expect(current()).toContain('Deal details')
  })

  it('asks before leaving a changed form, and stays when the merchant keeps editing', async () => {
    mount(ConfirmDialog, { attachTo: document.body })
    const { wrapper, router } = await openAt('/merchant/deals/new')
    await wrapper.get('#deal-title').setValue('Synthetic half-typed')

    await wrapper.get('[data-testid="deal-form-back"]').trigger('click')
    await flushPromises()
    expect(dialog()?.textContent).toContain('Discard changes?')
    press('.confirm-dialog__button--cancel')
    await vi.waitFor(
      () => expect(router.currentRoute.value.name).toBe('merchant-deal-new'),
      PAGE_LOAD,
    )

    await wrapper.get('[data-testid="deal-form-back"]').trigger('click')
    await flushPromises()
    press('[data-testid="confirm-dialog-confirm"]')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('merchant'), PAGE_LOAD)
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
    const { wrapper } = await openAt(`/merchant/deals/${ended.id}/run-again`)

    expect(wrapper.get('h1').text()).toBe('New deal')
    expect(wrapper.text()).toContain('Copied from "Synthetic Christmas set"')
    expect(wrapper.get<HTMLInputElement>('#deal-title').element.value).toBe(
      'Synthetic Christmas set',
    )
    expect(wrapper.get<HTMLInputElement>('#deal-price').element.value).toBe('4.5')
    expect(wrapper.get<HTMLInputElement>('#deal-start').element.value).toBe('')
    expect(wrapper.find('form img.add-deal__preview').exists()).toBe(false)
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
    const { wrapper, router } = await openAt('/merchant/deals/new')
    await fillNewDeal(wrapper)
    await wrapper.get(`#outlet-${outlet.id}`).setValue(true)
    await wrapper.get(`#outlet-${otherOutlet.id}`).setValue(true)
    await toReview(wrapper)

    // The first press opens the flash timing step and keeps only the first outlet.
    await button(wrapper, 'Save as flash deal').trigger('click')
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Flash timing')
    expect(wrapper.get('h1').text()).toBe('New flash deal')
    expect(wrapper.find('#deal-start').exists()).toBe(false)
    expect(wrapper.find('[data-testid="flash-preview"]').exists()).toBe(true)
    // The form's own offer is the flash offer, with the same choices as a deal.
    expect(wrapper.get('.add-deal__offers').attributes('aria-label')).toBe('Flash offer')
    await wrapper.get('[data-testid="merchant-offer-FIXED_PRICE"]').setValue(true)
    expect(wrapper.get('label[for="deal-price"]').text()).toContain('Flash price ($)')
    await wrapper.get('#deal-price').setValue('1.5')

    await wrapper.get(`#outlet-${otherOutlet.id}`).setValue(true)
    await wrapper.get('#flash-usual').setValue('1')
    // The timing step checks its own fields before the review opens.
    await save(wrapper)
    expect(wrapper.text()).toContain(
      'The usual price has to be higher than the flash price of $1.50.',
    )
    expect(flashApi.saveFlashDraft).not.toHaveBeenCalled()

    // Saving from the review checks every step and opens the first one with a problem.
    await wrapper.get('#flash-usual').setValue('4')
    await save(wrapper)
    expect(wrapper.get('[aria-current="step"]').text()).toContain('Outlets')
    expect(wrapper.text()).toContain('A flash deal runs at one outlet. Choose just one.')
    expect(flashApi.saveFlashDraft).not.toHaveBeenCalled()

    await wrapper.get(`#outlet-${otherOutlet.id}`).setValue(false)
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
    // Back on the dashboard's Flash deals tab, with the news.
    expect(router.currentRoute.value.fullPath).toBe('/merchant?tab=flash')
    expect(wrapper.get('[role="status"]').text()).toContain('was saved as a draft')
  })

  it('starts a new flash deal from its own address, at one outlet', async () => {
    const { wrapper } = await openAt('/merchant/flash/new')
    expect(wrapper.get('h1').text()).toBe('New flash deal')
    expect(wrapper.get('.add-deal__offers').attributes('aria-label')).toBe('Flash offer')
    expect(wrapper.get<HTMLInputElement>(`#outlet-${outlet.id}`).element.checked).toBe(true)
    await fillNewDeal(wrapper)
    await toReview(wrapper)
    expect(wrapper.text()).toContain('Flash')
    await save(wrapper)
    expect(flashApi.saveFlashDraft).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ outletId: outlet.id, offerType: 'BUY_ONE_GET_ONE' }),
    )
  })

  it('saves a 1-for-1 flash deal with no price', async () => {
    const { wrapper } = await openAt('/merchant/deals/new')
    await fillNewDeal(wrapper)
    await toReview(wrapper)
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
    const { wrapper } = await openAt('/merchant/deals/new')
    await fillNewDeal(wrapper)
    await toReview(wrapper)
    await button(wrapper, 'Save as flash deal').trigger('click')
    await button(wrapper, 'Make it an ordinary deal').trigger('click')
    expect(wrapper.find('[data-testid="flash-preview"]').exists()).toBe(false)
    expect(wrapper.get('.add-deal__offers').attributes('aria-label')).toBe('Offer type')
    await save(wrapper)
    expect(merchantApi.createDeal).toHaveBeenCalledOnce()
    expect(flashApi.saveFlashDraft).not.toHaveBeenCalled()
  })

  it('opens a flash deal draft from its address and saves changes to it', async () => {
    const draft = flashDraft()
    flashApi.getFlashDrops.mockResolvedValue([draft])
    const { wrapper } = await openAt(`/merchant/flash/${draft.id}/edit`)
    expect(wrapper.get('h1').text()).toBe('Edit flash deal draft')
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
    expect(wrapper.get('[role="status"]').text()).toContain('was updated')
  })

  it('will not open a flash deal that has already gone live', async () => {
    const live = flashDraft({ status: 'LIVE' })
    flashApi.getFlashDrops.mockResolvedValue([live])
    const { wrapper } = await openAt(`/merchant/flash/${live.id}/edit`)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('We could not find that flash deal draft.')
  })
})

describe('merchant deal form extras', () => {
  it("shows Lobbie's tip for each step, with flash tips for a flash deal", async () => {
    const { wrapper } = await openAt('/merchant/flash/new')
    const tip = () => wrapper.get('.add-deal-tip')
    expect(tip().get('img').attributes('src')).toBe('/chatbot-sprites/deal-found.svg')
    expect(tip().text()).toContain('Tip for a great deal!')
    await fillNewDeal(wrapper)
    await submit(wrapper)
    expect(tip().text()).toContain('Choosing your outlets')
    await submit(wrapper)
    expect(tip().text()).toContain('Timing a flash deal')
  })

  it('discards once, even when leaving takes a while and Cancel is pressed again', async () => {
    mount(ConfirmDialog, { attachTo: document.body })
    const { wrapper, router } = await openAt('/merchant/deals/new')
    // A slow session check on the way out, like a slow connection.
    let finishCheck: () => void = () => {}
    const stopSlowCheck = router.beforeEach(
      (to) =>
        to.name !== 'merchant' ||
        new Promise<boolean>((resolve) => {
          finishCheck = () => resolve(true)
        }),
    )
    await wrapper.get('#deal-title').setValue('Synthetic half-typed')

    await wrapper.get('[data-testid="deal-form-back"]').trigger('click')
    await flushPromises()
    press('[data-testid="confirm-dialog-confirm"]')
    await flushPromises()
    // Still on the form while the check runs, but it says it is leaving and won't ask again.
    expect(router.currentRoute.value.name).toBe('merchant-deal-new')
    const back = wrapper.get('[data-testid="deal-form-back"]')
    expect(back.text()).toContain('Leaving…')
    expect(back.attributes('disabled')).toBeDefined()
    void router.push('/merchant')
    await flushPromises()
    expect(dialog()).toBeNull()

    finishCheck()
    stopSlowCheck()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('merchant'), PAGE_LOAD)
    expect(dialog()).toBeNull()
  })
})
