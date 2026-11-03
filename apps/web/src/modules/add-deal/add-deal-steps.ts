import type { NewDeal, OfferType, Stall } from '@web/modules/add-deal/add-deal-api'

// The Add a deal form, split into steps. Each step checks only its own fields before the next
// one opens; submitting checks them all and sends the visitor back to the first step with a
// problem. Kept apart from the page so the rules can be tested without mounting it.

// Price is typed in dollars and turned into cents when submitting.
export const emptyDealForm = () => ({
  title: '',
  description: '',
  category: '',
  cuisine: '',
  offerType: '' as OfferType | '',
  discountPercent: '' as number | '',
  priceDollars: '' as number | '',
  startDate: '',
  endDate: '',
  terms: '',
})
export type DealForm = ReturnType<typeof emptyDealForm>

export const DESCRIPTION_MAX = 1000

export const ADD_DEAL_STEPS = [
  {
    id: 'details',
    label: 'Deal Details',
    fields: [
      'title',
      'description',
      'category',
      'cuisine',
      'offerType',
      'discountPercent',
      'priceDollars',
      'photo',
    ],
  },
  { id: 'location', label: 'Location', fields: ['stalls'] },
  { id: 'validity', label: 'Validity', fields: ['startDate', 'endDate', 'terms'] },
  { id: 'review', label: 'Review', fields: [] },
] as const
export type AddDealStep = (typeof ADD_DEAL_STEPS)[number]
export const LAST_STEP = ADD_DEAL_STEPS.length - 1

export type DealErrors = Record<string, string>

// One message per field with a problem, e.g. title: 'Please give the deal a title.'
// `today` is 'YYYY-MM-DD' in the visitor's time zone, to compare with the date boxes.
export const checkDeal = (
  form: DealForm,
  extras: { stallCount: number; hasPhoto: boolean; today: string },
): DealErrors => {
  const found: DealErrors = {}
  if (form.title.trim() === '') found.title = 'Please give the deal a title.'
  if (form.description.trim() === '') found.description = 'Please describe the deal.'
  if (form.category === '') found.category = 'Please choose a category.'
  if (form.cuisine === '') found.cuisine = 'Please choose a cuisine, or "No specific cuisine".'
  if (form.offerType === '') found.offerType = 'Please choose the type of offer.'
  if (
    form.offerType === 'PERCENT_OFF' &&
    (form.discountPercent === '' || form.discountPercent < 1 || form.discountPercent > 100)
  )
    found.discountPercent = 'The discount must be between 1 and 100 percent.'
  if (form.offerType === 'FIXED_PRICE' && (form.priceDollars === '' || form.priceDollars <= 0))
    found.priceDollars = 'Please enter the price.'
  if (!extras.hasPhoto) found.photo = 'Please add a photo of the deal.'
  if (extras.stallCount === 0) found.stalls = 'Please add at least one stall.'
  if (form.startDate === '') found.startDate = 'Please choose a start date.'
  if (form.endDate === '') found.endDate = 'Please choose the last day.'
  else if (form.endDate < extras.today) found.endDate = 'The last day cannot be in the past.'
  else if (form.startDate && form.endDate < form.startDate)
    found.endDate = 'The last day cannot be before the start date.'
  if (form.terms.trim() === '') found.terms = 'Please add the terms & conditions.'
  return found
}

// The problems that belong to one step.
export const errorsForStep = (errors: DealErrors, step: number): DealErrors => {
  const fields: readonly string[] = ADD_DEAL_STEPS[step]?.fields ?? []
  return Object.fromEntries(Object.entries(errors).filter(([field]) => fields.includes(field)))
}

// The first step holding a problem, or null when the deal is ready to send.
export const firstStepWithErrors = (errors: DealErrors): number | null => {
  const step = ADD_DEAL_STEPS.findIndex((candidate) =>
    candidate.fields.some((field: string) => field in errors),
  )
  return step === -1 ? null : step
}

// The payload the API takes, from a form that has passed checkDeal.
export const toNewDeal = (form: DealForm, stalls: readonly Stall[]): NewDeal => ({
  title: form.title.trim(),
  description: form.description.trim(),
  category: form.category,
  cuisine: form.cuisine === 'NONE' ? null : form.cuisine,
  offerType: form.offerType as OfferType,
  discountPercent: form.offerType === 'PERCENT_OFF' ? Number(form.discountPercent) : null,
  priceCents: form.offerType === 'FIXED_PRICE' ? Math.round(Number(form.priceDollars) * 100) : null,
  stallIds: stalls.map((stall) => stall.id),
  startDate: form.startDate,
  endDate: form.endDate,
  terms: form.terms.trim(),
})
