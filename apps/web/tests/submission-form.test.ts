import { enableAutoUnmount, mount } from '@vue/test-utils'
import SubmissionForm from '@web/pages/SubmissionForm.vue'
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

async function fillValidForm(wrapper: FormWrapper) {
  await wrapper.get('#deal-title').setValue('  1-for-1 chicken rice  ')
  await wrapper.get('#deal-description').setValue('  Two plates for one.  ')
  await wrapper.get('#deal-category').setValue('FOOD')
  await wrapper.get('#deal-cuisine').setValue('CHINESE')
  await wrapper.get('#deal-offer').setValue('BUY_ONE_GET_ONE')
  await addStall(wrapper)
  await wrapper.get('#deal-start').setValue('2099-01-01')
  await wrapper.get('#deal-end').setValue('2099-01-31')
  await wrapper.get('#deal-terms').setValue('  Dine-in only  ')
  await selectPhoto(wrapper, new File(['image'], 'lunch.png', { type: 'image/png' }))
}

const errorTexts = (wrapper: FormWrapper) =>
  wrapper
    .findAll('.invalid-feedback, .text-danger')
    .map((error) => error.text())
    .filter(Boolean)

describe('add a deal form', () => {
  it('shows its heading, sample-mode notice and field labels', () => {
    const wrapper = mountForm()
    expect(wrapper.get('h1').text()).toBe('Add a deal')
    expect(wrapper.text()).toContain('Sample mode')
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'Title',
      'Description',
      'Category',
      'Cuisine',
      'Offer type',
      'Find the stall',
      'Start date',
      'Last day',
      'Terms & conditions',
      'Photo of the deal (JPEG, PNG or WebP, up to 4 MB)',
    ])
    expect(wrapper.get('#deal-cuisine').text()).toContain('No specific cuisine')
    expect(wrapper.get('#deal-photo').attributes('accept')).toBe('image/jpeg,image/png,image/webp')
  })

  it('lists every problem and sends nothing when submitted empty', async () => {
    const wrapper = mountForm()
    await wrapper.get('form').trigger('submit')
    expect(errorTexts(wrapper)).toEqual([
      'Please give the deal a title.',
      'Please describe the deal.',
      'Please choose a category.',
      'Please choose a cuisine, or "No specific cuisine".',
      'Please choose the type of offer.',
      'Please add at least one stall.',
      'Please choose a start date.',
      'Please choose the last day.',
      'Please add the terms & conditions.',
      'Please add a photo of the deal.',
    ])
    expect(wrapper.get('[role="alert"]').text()).toBe('Please fix the highlighted fields.')
    expect(addDealApi.submitDeal).not.toHaveBeenCalled()
  })

  it.each([
    ['', 'The discount must be between 1 and 100 percent.'],
    ['0', 'The discount must be between 1 and 100 percent.'],
    ['101', 'The discount must be between 1 and 100 percent.'],
  ])('rejects a %j percent discount', async (percent, message) => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('#deal-offer').setValue('PERCENT_OFF')
    await wrapper.get('#deal-discount').setValue(percent)
    await wrapper.get('form').trigger('submit')
    expect(errorTexts(wrapper)).toEqual([message])
    expect(addDealApi.submitDeal).not.toHaveBeenCalled()
  })

  it('asks for a price on a fixed-price offer', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('#deal-offer').setValue('FIXED_PRICE')
    await wrapper.get('form').trigger('submit')
    expect(errorTexts(wrapper)).toEqual(['Please enter the price.'])
  })

  it('rejects a last day before the start date or in the past', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('#deal-end').setValue('2098-12-31')
    await wrapper.get('form').trigger('submit')
    expect(errorTexts(wrapper)).toEqual(['The last day cannot be before the start date.'])

    await wrapper.get('#deal-end').setValue('2000-01-01')
    await wrapper.get('form').trigger('submit')
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
    expect(wrapper.find('img').exists()).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('previews an accepted photo', async () => {
    const wrapper = mountForm()
    const file = new File(['image'], 'lunch.webp', { type: 'image/webp' })
    Object.defineProperty(file, 'size', { value: 4 * 1024 * 1024 })
    await selectPhoto(wrapper, file)
    expect(errorTexts(wrapper)).toEqual([])
    expect(wrapper.get('img').attributes('src')).toBe('blob:synthetic-deal-preview')
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

  it('submits a trimmed deal with its photo, shows a pop-up and clears the form', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('#deal-cuisine').setValue('NONE')
    await wrapper.get('#deal-offer').setValue('FIXED_PRICE')
    await wrapper.get('#deal-price').setValue('4.5')
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
    expect(wrapper.find('img').exists()).toBe(false)
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
