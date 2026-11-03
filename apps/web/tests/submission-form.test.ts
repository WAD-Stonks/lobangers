import { enableAutoUnmount, mount } from '@vue/test-utils'
import SubmissionForm from '@web/pages/SubmissionForm.vue'
import { chooseOption, optionLabels } from '@web-tests/support/select'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const addDealApi = vi.hoisted(() => ({ submitDeal: vi.fn(), searchStalls: vi.fn() }))

vi.mock('@web/modules/add-deal/add-deal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/add-deal/add-deal-api')>()),
  submitDeal: addDealApi.submitDeal,
  searchStalls: addDealApi.searchStalls,
}))

enableAutoUnmount(afterEach)

const createObjectURL = vi.fn(() => 'blob:synthetic-deal-preview')

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  addDealApi.searchStalls.mockResolvedValue([stall])
  addDealApi.submitDeal.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

const stall = {
  id: 'stall-1',
  name: 'Campus Chicken Rice',
  merchantName: 'Campus Chicken Rice',
  address: '1 Stamford Rd',
}

// Renders the pop-up inline so its title and message can be read without a teleport.
const BModalStub = {
  props: ['modelValue', 'title'],
  template: '<div v-if="modelValue" class="popup-stub"><h5>{{ title }}</h5><slot /></div>',
}

const mountForm = () => mount(SubmissionForm, { global: { stubs: { BModal: BModalStub } } })
type FormWrapper = ReturnType<typeof mountForm>

const flush = () => new Promise((resolve) => setTimeout(resolve))

async function selectPhoto(wrapper: FormWrapper, file: File | null) {
  const input = wrapper.get<HTMLInputElement>('#deal-photo')
  Object.defineProperty(input.element, 'files', { configurable: true, value: file ? [file] : [] })
  await input.trigger('change')
}

async function addStall(wrapper: FormWrapper) {
  await wrapper.get('#stall-search').setValue('chicken')
  await wrapper.get('#stall-search').trigger('keydown.enter')
  await flush()
  const add = wrapper.findAll('button').find((button) => button.text() === 'Add')
  await add?.trigger('click')
}

const next = async (wrapper: FormWrapper) => {
  await wrapper.get('[data-testid="add-deal-next"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flush()
}
const chooseOffer = (wrapper: FormWrapper, value: string) =>
  wrapper.get(`[data-testid="offer-${value}"]`).setValue(true)
const stepShown = (wrapper: FormWrapper) => wrapper.get('[aria-current="step"]').text()

async function fillDetails(wrapper: FormWrapper) {
  await wrapper.get('#deal-title').setValue('  1-for-1 chicken rice  ')
  await wrapper.get('#deal-description').setValue('  Two plates for one.  ')
  await chooseOption(wrapper, '#deal-category', 'FOOD')
  await chooseOption(wrapper, '#deal-cuisine', 'CHINESE')
  await chooseOffer(wrapper, 'BUY_ONE_GET_ONE')
  await selectPhoto(wrapper, new File(['image'], 'lunch.png', { type: 'image/png' }))
}
async function fillValidity(wrapper: FormWrapper) {
  await wrapper.get('#deal-start').setValue('2099-01-01')
  await wrapper.get('#deal-end').setValue('2099-01-31')
  await wrapper.get('#deal-terms').setValue('  Dine-in only  ')
}
// Fills every step and stops on Review.
async function fillValidForm(wrapper: FormWrapper) {
  await fillDetails(wrapper)
  await next(wrapper)
  await addStall(wrapper)
  await next(wrapper)
  await fillValidity(wrapper)
  await next(wrapper)
}

const errorTexts = (wrapper: FormWrapper) =>
  wrapper
    .findAll('.invalid-feedback, .add-deal__error')
    .map((error) => error.text())
    .filter(Boolean)

describe('add a deal form', () => {
  it("shows its heading, the four steps and the first step's fields", async () => {
    const wrapper = mountForm()
    expect(wrapper.get('h1').text()).toBe('Add a deal')
    expect(wrapper.findAll('.add-deal-stepper__label').map((step) => step.text())).toEqual([
      'Step 1: Deal Details',
      'Step 2: Location',
      'Step 3: Validity',
      'Step 4: Review',
    ])
    expect(stepShown(wrapper)).toContain('Deal Details')
    expect(wrapper.get('legend').text()).toBe('Offer type *')
    expect(wrapper.findAll('.add-deal__offer').map((offer) => offer.text())).toEqual([
      '1-for-1',
      'Discount',
      'Fixed price',
      'Others',
    ])
    expect(await optionLabels(wrapper, '#deal-cuisine')).toContain(
      'No specific cuisine (e.g. drinks, desserts)',
    )
    expect(wrapper.get('#deal-photo').attributes('accept')).toBe('image/jpeg,image/png,image/webp')
    expect(wrapper.find('.add-deal-tip img').attributes('src')).toBe(
      '/chatbot-sprites/deal-found.svg',
    )
  })

  it('checks only the step in view before moving on', async () => {
    const wrapper = mountForm()
    await next(wrapper)
    expect(errorTexts(wrapper)).toEqual([
      'Please give the deal a title.',
      'Please describe the deal.',
      'Please choose a category.',
      'Please choose a cuisine, or "No specific cuisine".',
      'Please choose the type of offer.',
      'Please add a photo of the deal.',
    ])
    expect(wrapper.get('[role="alert"]').text()).toBe('Please fix the highlighted fields.')
    expect(stepShown(wrapper)).toContain('Deal Details')

    await fillDetails(wrapper)
    await next(wrapper)
    expect(errorTexts(wrapper)).toEqual([])
    expect(stepShown(wrapper)).toContain('Location')
    await next(wrapper)
    expect(errorTexts(wrapper)).toEqual(['Please add at least one stall.'])
    expect(addDealApi.submitDeal).not.toHaveBeenCalled()
  })

  it('goes back a step, and reopens passed steps from the stepper, keeping what was typed', async () => {
    const wrapper = mountForm()
    await fillDetails(wrapper)
    await next(wrapper)
    await wrapper.get('[data-testid="add-deal-back"]').trigger('click')
    await flush()
    expect(stepShown(wrapper)).toContain('Deal Details')
    expect(wrapper.get('#deal-title').element).toHaveProperty('value', '  1-for-1 chicken rice  ')
    expect(wrapper.get('[data-testid="step-validity"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="step-location"]').trigger('click')
    await flush()
    expect(stepShown(wrapper)).toContain('Location')
  })

  it.each([
    ['', 'The discount must be between 1 and 100 percent.'],
    ['0', 'The discount must be between 1 and 100 percent.'],
    ['101', 'The discount must be between 1 and 100 percent.'],
  ])('rejects a %j percent discount', async (percent, message) => {
    const wrapper = mountForm()
    await fillDetails(wrapper)
    await chooseOffer(wrapper, 'PERCENT_OFF')
    await wrapper.get('#deal-discount').setValue(percent)
    await next(wrapper)
    expect(errorTexts(wrapper)).toEqual([message])
  })

  it('asks for a price on a fixed-price offer', async () => {
    const wrapper = mountForm()
    await fillDetails(wrapper)
    await chooseOffer(wrapper, 'FIXED_PRICE')
    await next(wrapper)
    expect(errorTexts(wrapper)).toEqual(['Please enter the price.'])
  })

  it('rejects a last day before the start date or in the past', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('[data-testid="review-edit-2"]').trigger('click')
    await flush()
    await wrapper.get('#deal-end').setValue('2098-12-31')
    await next(wrapper)
    expect(errorTexts(wrapper)).toEqual(['The last day cannot be before the start date.'])

    await wrapper.get('#deal-end').setValue('2000-01-01')
    await next(wrapper)
    expect(errorTexts(wrapper)).toEqual(['The last day cannot be in the past.'])
  })

  it('rejects photos of the wrong type or over 4 MB without a preview', async () => {
    const wrapper = mountForm()
    await selectPhoto(wrapper, new File(['gif'], 'deal.gif', { type: 'image/gif' }))
    expect(errorTexts(wrapper)).toEqual(['Please choose a JPEG, PNG or WebP image.'])

    const large = new File(['image'], 'large.png', { type: 'image/png' })
    Object.defineProperty(large, 'size', { value: 4 * 1024 * 1024 + 1 })
    await selectPhoto(wrapper, large)
    expect(errorTexts(wrapper)).toEqual(['The image must be 4 MB or smaller.'])
    expect(wrapper.find('.add-deal__preview').exists()).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('previews an accepted photo', async () => {
    const wrapper = mountForm()
    const file = new File(['image'], 'lunch.webp', { type: 'image/webp' })
    Object.defineProperty(file, 'size', { value: 4 * 1024 * 1024 })
    await selectPhoto(wrapper, file)
    expect(errorTexts(wrapper)).toEqual([])
    expect(wrapper.get('.add-deal__preview').attributes('src')).toBe('blob:synthetic-deal-preview')
    expect(createObjectURL).toHaveBeenCalledWith(file)
  })

  it('searches stalls, adds one once and removes it again', async () => {
    const wrapper = mountForm()
    await addStall(wrapper)
    expect(addDealApi.searchStalls).toHaveBeenCalledWith('chicken')
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Added')
    expect(wrapper.text()).not.toContain('No stalls added yet.')

    const remove = wrapper.findAll('button').find((button) => button.text() === 'Remove')
    await remove?.trigger('click')
    expect(wrapper.text()).toContain('No stalls added yet.')
  })

  it('says when a stall search finds nothing', async () => {
    addDealApi.searchStalls.mockResolvedValue([])
    const wrapper = mountForm()
    await wrapper.get('#stall-search').setValue('nothing')
    await wrapper.get('#stall-search').trigger('keydown.enter')
    await flush()
    expect(wrapper.text()).toContain('No stalls found. Try other words.')
  })

  it('reviews the deal before sending it', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    expect(stepShown(wrapper)).toContain('Review')
    const review = wrapper.get('.add-deal__review').text()
    expect(review).toContain('1-for-1 chicken rice')
    expect(review).toContain('Campus Chicken Rice')
    expect(review).toContain('1 Jan 2099 to 31 Jan 2099')
    expect(wrapper.find('.add-deal-tip img').attributes('src')).toBe('/chatbot-sprites/hello.svg')
  })

  it('submits a trimmed deal with its photo, shows a pop-up and clears the form', async () => {
    const wrapper = mountForm()
    await fillDetails(wrapper)
    await chooseOption(wrapper, '#deal-cuisine', 'NONE')
    await chooseOffer(wrapper, 'FIXED_PRICE')
    await wrapper.get('#deal-price').setValue('4.5')
    await next(wrapper)
    await addStall(wrapper)
    await next(wrapper)
    await fillValidity(wrapper)
    await next(wrapper)
    await wrapper.get('form').trigger('submit')
    await flush()

    expect(addDealApi.submitDeal).toHaveBeenCalledOnce()
    const [deal, photo] = addDealApi.submitDeal.mock.calls[0] ?? []
    expect(deal).toEqual({
      title: '1-for-1 chicken rice',
      description: 'Two plates for one.',
      category: 'FOOD',
      cuisine: null,
      offerType: 'FIXED_PRICE',
      discountPercent: null,
      priceCents: 450,
      stallIds: ['stall-1'],
      startDate: '2099-01-01',
      endDate: '2099-01-31',
      terms: 'Dine-in only',
    })
    expect(photo).toBeInstanceOf(File)
    expect(wrapper.get('.popup-stub').text()).toContain('Deal submitted')
    expect(wrapper.get('#deal-title').element).toHaveProperty('value', '')
    expect(wrapper.find('.add-deal__preview').exists()).toBe(false)
    expect(stepShown(wrapper)).toContain('Deal Details')
  })

  it('keeps the fields and explains the problem when submitting fails', async () => {
    addDealApi.submitDeal.mockRejectedValue(new Error('PHOTO_UPLOAD_FAILED'))
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('form').trigger('submit')
    await flush()

    expect(wrapper.get('.popup-stub').text()).toContain('Could not submit')
    expect(wrapper.get('.popup-stub').text()).toContain(
      'Could not upload the photo. Please try again.',
    )
    expect(wrapper.get('#deal-title').element).toHaveProperty('value', '  1-for-1 chicken rice  ')
    expect(wrapper.get('button[type="submit"]').element).toHaveProperty('disabled', false)
  })
})
