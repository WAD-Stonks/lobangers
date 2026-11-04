<script setup lang="ts">
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromLabels, withLeading } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { formatDate, formatMoneyMinor } from '@web/lib/format'
import { useConfirm } from '@web/lib/use-confirm'
import { useUnsavedChanges } from '@web/lib/use-unsaved-changes'
import '@web/modules/add-deal/add-deal-form.css'
import AddDealStepper from '@web/modules/add-deal/AddDealStepper.vue'
import { DESCRIPTION_MAX } from '@web/modules/add-deal/add-deal-steps'
import { OFFER_TILES } from '@web/modules/add-deal/offer-tiles'
import PhotoDropzone from '@web/modules/add-deal/PhotoDropzone.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import DealSection from '@web/modules/merchant/DealSection.vue'
import FlashDealFields from '@web/modules/merchant/FlashDealFields.vue'
import FlashDropsSection from '@web/modules/merchant/FlashDropsSection.vue'
import {
  type MerchantFlashDropBody as FlashBody,
  flashDropErrorMessage,
  type MerchantFlashDrop,
  saveFlashDraft,
} from '@web/modules/merchant/flash-drop-api'
import {
  bannerPreview,
  blankFlashFields,
  type FlashFieldsState,
  type FlashProblem,
  flashFieldsFromDrop,
  flashFieldsProblem,
  toFlashDropBody,
} from '@web/modules/merchant/flash-drop-rules'
import MerchantCardGrid from '@web/modules/merchant/MerchantCardGrid.vue'
import MerchantDealCard from '@web/modules/merchant/MerchantDealCard.vue'
import {
  createDeal,
  type DealInput,
  type DealPhoto,
  deleteDeal,
  endDeal,
  errorMessageFor,
  getDeals,
  getOutlets,
  MAX_PHOTO_BYTES,
  type MerchantDeal,
  type MerchantOutlet,
  type OfferType,
  PHOTO_TYPES,
  savePhoto,
  updateDeal,
} from '@web/modules/merchant/merchant-api'
import { computed, nextTick, onMounted, ref } from 'vue'

// The app's own confirm dialog, in place of the browser's.
const { ask } = useConfirm()

const outlets = ref<MerchantOutlet[]>([])
const deals = ref<MerchantDeal[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// ----- Form -----
// showForm opens the form card. editingId is null when creating a new deal,
// or the id of the deal being edited.
const showForm = ref(false)
const editingId = ref<string | null>(null)
// The title of the ended deal a new deal was copied from ("Run it again"), or null.
const copiedFrom = ref<string | null>(null)
// "Save as flash deal": the same form, plus the flash fields. A flash deal is saved as a draft
// and only goes public when the merchant presses Go live in the Flash deals section.
// editingFlash is the draft being changed, or null for a new flash deal.
const flashMode = ref(false)
const editingFlash = ref<MerchantFlashDrop | null>(null)
const flashFields = ref<FlashFieldsState>(blankFlashFields())
const flashProblem = ref<FlashProblem | null>(null)
const formError = ref('')
// One message per field, e.g. fieldErrors.title = 'Please give the deal a title.'
const fieldErrors = ref<Record<string, string>>({})
const formEl = ref<HTMLFormElement | null>(null)

// The form's fields. Price is typed in dollars here and turned into cents when saving.
const emptyForm = () => ({
  title: '',
  description: '',
  category: '',
  cuisine: '', // 'NONE' means "No specific cuisine"
  outletIds: [] as string[],
  offerType: 'PERCENT_OFF' as OfferType,
  discountPercent: '' as number | '',
  priceDollars: '' as number | '',
  startDate: '',
  endDate: '',
  terms: '',
  savedPhoto: null as DealPhoto | null, // the deal's current photo, kept unless removed or replaced
})
const form = ref(emptyForm())
// A newly chosen photo. It is only uploaded when the deal is saved.
const newPhoto = ref<File | null>(null)
const newPhotoPreview = ref('') // a temporary link to the chosen image, for the <img> preview
const photoInput = ref<InstanceType<typeof PhotoDropzone> | null>(null)
// The form as it was opened, so Cancel and leaving the page only warn when something changed.
const openedAs = ref('')
const snapshot = () =>
  JSON.stringify({ form: form.value, flash: flashMode.value ? flashFields.value : null })
const isDirty = computed(
  () => showForm.value && (snapshot() !== openedAs.value || newPhoto.value !== null),
)
const { confirmDiscard } = useUnsavedChanges(isDirty)

// Links a field to its error text so screen readers read the message with the field.
const invalidAttrs = (field: string) =>
  fieldErrors.value[field]
    ? { 'aria-invalid': 'true' as const, 'aria-describedby': `error-${field}` }
    : {}

// ----- Steps -----
// The same four steps as the visitor's Add a deal form, so both read alike: details, where it
// runs, when it runs, then a review. Each step checks only its own fields before the next one
// opens; saving checks them all and opens the first step with a problem.
const STEP_FIELDS: readonly (readonly string[])[] = [
  ['title', 'description', 'category', 'cuisine', 'discountPercent', 'priceDollars', 'photo'],
  ['outletIds'],
  ['endDate'],
  [],
]
const LAST_STEP = STEP_FIELDS.length - 1
const TIMING_STEP = 2
const step = ref(0)
// The furthest step opened so far; the stepper reopens any of these.
const reached = ref(0)
const stepHeadings = ref<HTMLElement[]>([])
const stepLabels = computed(() => [
  'Deal details',
  'Outlets',
  flashMode.value ? 'Flash timing' : 'Validity',
  'Review',
])
const nextLabel = computed(() => stepLabels.value[step.value + 1] ?? '')
const stepOf = (field: string) => STEP_FIELDS.findIndex((fields) => fields.includes(field))

// A new deal starts at the first step; an existing or copied one is already filled in, so
// every step can be opened straight away.
const startSteps = (prefilled: boolean) => {
  step.value = 0
  reached.value = prefilled ? LAST_STEP : 0
}

// Opens a step and moves focus to its heading, so keyboard and screen reader users land on it.
const go = async (target: number) => {
  step.value = target
  reached.value = Math.max(reached.value, target)
  formError.value = ''
  await nextTick()
  stepHeadings.value[target]?.focus()
  formEl.value?.scrollIntoView?.({ block: 'start' })
}

const offerLabels: Record<OfferType, string> = {
  BUY_ONE_GET_ONE: '1-for-1',
  PERCENT_OFF: '% off',
  FIXED_PRICE: 'Fixed price',
  OTHER: 'Other',
}

// Same choices as the Add-a-deal form.
const categoryLabels: Record<string, string> = {
  FOOD: 'Food',
  DRINKS: 'Drinks',
  DESSERT: 'Dessert',
  SNACKS: 'Snacks',
  BAKERY: 'Bakery',
}
// The app's shared cuisine list (Chinese, Malay, ...), plus our own "no cuisine" choice.
const cuisineLabels: Record<string, string> = {
  ...DEAL_CUISINE_LABELS,
  NONE: 'No specific cuisine (e.g. drinks, desserts)',
}

const categoryOptions = withLeading({ value: '', label: 'Choose a category' }, optionsFromLabels(categoryLabels))
const cuisineOptions = withLeading({ value: '', label: 'Choose a cuisine' }, optionsFromLabels(cuisineLabels))

// ----- Deal status -----
// Today's date as 'YYYY-MM-DD' in the merchant's own time zone, so it can be compared with
// the form's date strings.
const today = new Date().toLocaleDateString('en-CA')

const statusOf = (deal: MerchantDeal): 'Live' | 'Scheduled' | 'Ended' => {
  if (deal.endedAt) return 'Ended'
  if (deal.endDate && deal.endDate < today) return 'Ended'
  if (deal.startDate && deal.startDate > today) return 'Scheduled'
  return 'Live'
}

// Ended deals go in their own list further down the page.
const currentDeals = computed(() => deals.value.filter((deal) => statusOf(deal) !== 'Ended'))
const endedDeals = computed(() => deals.value.filter((deal) => statusOf(deal) === 'Ended'))
// The current deals in their two dropdowns. Live starts open; Scheduled starts closed.
const currentGroups = computed(() => [
  {
    key: 'live',
    title: 'Live',
    empty: 'No live deals.',
    open: true,
    deals: currentDeals.value.filter((deal) => statusOf(deal) === 'Live'),
  },
  {
    key: 'scheduled',
    title: 'Scheduled',
    empty: 'No scheduled deals.',
    open: false,
    deals: currentDeals.value.filter((deal) => statusOf(deal) === 'Scheduled'),
  },
])

// ----- Text helpers for showing a deal -----
const offerText = (deal: MerchantDeal) => {
  if (deal.offerType === 'PERCENT_OFF') return `${deal.discountPercent}% off`
  if (deal.offerType === 'FIXED_PRICE') return formatMoneyMinor(deal.priceCents ?? 0)
  return offerLabels[deal.offerType]
}

const datesText = (deal: MerchantDeal) => {
  const from = deal.startDate ? formatDate(deal.startDate) : 'Now'
  const until = deal.endDate ? formatDate(deal.endDate) : 'no end date'
  return `${from} to ${until}`
}

const outletNames = (deal: MerchantDeal) =>
  outlets.value
    .filter((outlet) => deal.outletIds.includes(outlet.id))
    .map((outlet) => outlet.name)
    .join(', ')

// ----- Loading -----
const loadDashboard = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    outlets.value = await getOutlets()
    deals.value = await getDeals()
  } catch (error) {
    errorMessage.value = errorMessageFor(error, 'Could not load your deals. Please try again.')
  } finally {
    loading.value = false
  }
}

// ----- Photo -----
const clearNewPhoto = () => {
  newPhoto.value = null
  newPhotoPreview.value = ''
  photoInput.value?.clear() // empty the file box
}

const choosePhoto = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  delete fieldErrors.value.photo
  if (file === null) return

  if (!PHOTO_TYPES.includes(file.type)) {
    fieldErrors.value.photo = 'Please choose a JPEG, PNG or WebP image.'
    input.value = ''
    return
  }
  if (file.size > MAX_PHOTO_BYTES) {
    fieldErrors.value.photo = 'The image must be 4 MB or smaller.'
    input.value = ''
    return
  }
  newPhoto.value = file
  newPhotoPreview.value = URL.createObjectURL(file)
}

// The photo is optional, so Remove takes off both a newly chosen photo and the saved one.
const removePhoto = () => {
  clearNewPhoto()
  form.value.savedPhoto = null
}

// What the form shows: a newly chosen photo first, otherwise the deal's saved one.
const shownPhoto = computed(() => newPhotoPreview.value || form.value.savedPhoto?.url || '')

// ----- Opening and closing the form -----
// Every way of opening the form starts as an ordinary deal unless it says otherwise.
const resetFlash = () => {
  flashMode.value = false
  editingFlash.value = null
  flashFields.value = blankFlashFields()
  flashProblem.value = null
}

const openCreateForm = async () => {
  if (!(await confirmDiscard())) return
  clearNewPhoto()
  resetFlash()
  form.value = emptyForm()
  // A merchant with only one outlet will almost always pick it, so tick it for them.
  if (outlets.value.length === 1) form.value.outletIds = outlets.value.map((outlet) => outlet.id)
  editingId.value = null
  copiedFrom.value = null
  startSteps(false)
  formError.value = ''
  fieldErrors.value = {}
  successMessage.value = ''
  openedAs.value = snapshot()
  showForm.value = true
}

// The form's fields filled from a deal, for editing it or running it again.
const formFrom = (deal: MerchantDeal) => ({
  title: deal.title,
  description: deal.description,
  category: deal.category,
  cuisine: deal.cuisine ?? 'NONE',
  outletIds: [...deal.outletIds],
  offerType: deal.offerType,
  discountPercent: deal.discountPercent ?? ('' as number | ''),
  priceDollars: deal.priceCents === null ? ('' as number | '') : deal.priceCents / 100,
  startDate: deal.startDate,
  endDate: deal.endDate,
  terms: deal.terms,
  savedPhoto: deal.photo ?? null,
})

// An ended deal can't be edited, but it can run again as a new deal with the same details.
// The dates start empty (from now, no end), and the photo stays with the old deal, since a
// photo belongs to one deal only.
const openRunAgainForm = async (deal: MerchantDeal) => {
  if (!(await confirmDiscard())) return
  clearNewPhoto()
  resetFlash()
  // Outlets the merchant no longer manages are left out.
  const managed = new Set(outlets.value.map((outlet) => outlet.id))
  form.value = {
    ...formFrom(deal),
    outletIds: deal.outletIds.filter((id) => managed.has(id)),
    startDate: '',
    endDate: '',
    savedPhoto: null,
  }
  editingId.value = null
  copiedFrom.value = deal.title
  startSteps(true)
  formError.value = ''
  fieldErrors.value = {}
  successMessage.value = ''
  openedAs.value = snapshot()
  showForm.value = true
  // The ended deals are at the bottom of the page and the form at the top.
  nextTick(() => formEl.value?.scrollIntoView?.({ block: 'start' }))
}

const openEditForm = async (deal: MerchantDeal) => {
  if (!(await confirmDiscard())) return
  clearNewPhoto()
  resetFlash()
  form.value = formFrom(deal)
  editingId.value = deal.id
  copiedFrom.value = null
  startSteps(true)
  formError.value = ''
  fieldErrors.value = {}
  successMessage.value = ''
  openedAs.value = snapshot()
  showForm.value = true
}

// Edit on a flash deal draft opens it in this form with its flash fields.
const openFlashDraftForm = async (drop: MerchantFlashDrop) => {
  if (!(await confirmDiscard())) return
  clearNewPhoto()
  const { deal } = drop
  form.value = {
    title: deal.title,
    description: deal.description,
    category: deal.category,
    cuisine: deal.cuisine ?? 'NONE',
    outletIds: [drop.outletId],
    offerType: deal.offerType,
    discountPercent: deal.discountPercent ?? '',
    priceDollars: deal.priceCents === null ? '' : deal.priceCents / 100,
    startDate: '',
    endDate: '',
    terms: deal.terms,
    savedPhoto: deal.photo,
  }
  editingId.value = null
  copiedFrom.value = null
  flashMode.value = true
  editingFlash.value = drop
  flashFields.value = flashFieldsFromDrop(drop)
  startSteps(true)
  flashProblem.value = null
  formError.value = ''
  fieldErrors.value = {}
  successMessage.value = ''
  openedAs.value = snapshot()
  showForm.value = true
  // The Flash deals section is below the deals and the form at the top.
  nextTick(() => formEl.value?.scrollIntoView?.({ block: 'start' }))
}

// "Save as flash deal" on the review turns the deal into a flash deal and opens its timing
// step, where the flash fields replace the dates; the next press on the review saves it.
const showFlashFields = async () => {
  flashMode.value = true
  // A flash deal runs at one outlet; keep the first one ticked.
  form.value.outletIds = form.value.outletIds.slice(0, 1)
  await go(TIMING_STEP)
}

const backToNormalDeal = () => {
  flashMode.value = false
  flashProblem.value = null
}

const closeForm = () => {
  showForm.value = false
  clearNewPhoto()
}

// Cancel asks first when the merchant has changed something.
const cancelForm = async () => {
  if (await confirmDiscard()) closeForm()
}

// Shows one step's problems and focuses the first, opening that step if it isn't showing.
const flagStep = async (target: number, problems: Record<string, string>) => {
  if (step.value !== target) await go(target)
  fieldErrors.value = problems
  formError.value = 'Please fix the highlighted fields.'
  await nextTick()
  focusFirstInvalid(formEl.value?.querySelector(`[data-step="${target}"]`))
}

const problemsIn = (problems: Record<string, string>, target: number) =>
  Object.fromEntries(Object.entries(problems).filter(([field]) => stepOf(field) === target))

// The flash fields (start, length, usual price) belong to the timing step.
const checkFlashTiming = () => {
  const offer = flashOffer.value
  flashProblem.value = flashFieldsProblem(
    flashFields.value,
    { offerType: offer.offerType, priceCents: offer.flashPriceCents },
    new Date(),
  )
  return flashProblem.value !== null
}

// Saving checks every step and opens the first one with a problem.
const flagFirstProblem = (problems: Record<string, string>, flashTimingBad: boolean) => {
  const steps = Object.keys(problems).map(stepOf).filter((index) => index >= 0)
  if (flashTimingBad) steps.push(TIMING_STEP)
  const target = Math.min(...steps)
  return flagStep(target, problemsIn(problems, target))
}

const next = async () => {
  const problems = problemsIn(checkForm(), step.value)
  const flashTimingBad = step.value === TIMING_STEP && flashMode.value && checkFlashTiming()
  if (Object.keys(problems).length > 0 || flashTimingBad) return flagStep(step.value, problems)
  fieldErrors.value = {}
  await go(step.value + 1)
}

const back = () => (step.value === 0 ? cancelForm() : go(step.value - 1))

// ----- Review -----
const offerSummary = computed(() => {
  const f = form.value
  if (f.offerType === 'PERCENT_OFF' && f.discountPercent !== '') return `${f.discountPercent}% off`
  if (f.offerType === 'FIXED_PRICE' && f.priceDollars !== '')
    return `${flashMode.value ? 'Flash price' : 'Fixed price'}, ${formatMoneyMinor(Math.round(Number(f.priceDollars) * 100))}`
  return OFFER_TILES.find((offer) => offer.value === f.offerType)?.label ?? ''
})
const review = computed(() => {
  const f = form.value
  const runs = `${f.startDate ? formatDate(f.startDate) : 'From today'} to ${f.endDate ? formatDate(f.endDate) : 'no end date'}`
  return [
    {
      step: 0,
      rows: [
        ['Title', f.title.trim()],
        ['Description', f.description.trim()],
        ['Category', categoryLabels[f.category] ?? ''],
        ['Cuisine', cuisineLabels[f.cuisine] ?? ''],
        ['Offer', offerSummary.value],
      ],
    },
    {
      step: 1,
      rows: [
        [
          f.outletIds.length === 1 ? 'Outlet' : 'Outlets',
          outlets.value
            .filter((outlet) => f.outletIds.includes(outlet.id))
            .map((outlet) => outlet.name)
            .join(', '),
        ],
      ],
    },
    {
      step: TIMING_STEP,
      rows: [
        flashMode.value
          ? ['Flash', bannerPreview(flashFields.value, f.title, flashOffer.value)]
          : ['Runs', runs],
        ['Terms', f.terms.trim()],
      ],
    },
  ]
})

// Returns a message for every field that has a problem; an empty object means the form is fine.
const checkForm = () => {
  const f = form.value
  const found: Record<string, string> = {}
  if (f.title.trim() === '') found.title = 'Please give the deal a title.'
  if (f.description.trim() === '') found.description = 'Please describe the deal.'
  if (f.category === '') found.category = 'Please choose a category.'
  if (f.cuisine === '') found.cuisine = 'Please choose a cuisine, or "No specific cuisine".'
  if (f.outletIds.length === 0) found.outletIds = 'Please choose at least one outlet.'
  else if (flashMode.value && f.outletIds.length > 1)
    found.outletIds = 'A flash deal runs at one outlet. Choose just one.'
  if (f.offerType === 'PERCENT_OFF') {
    if (f.discountPercent === '' || f.discountPercent < 1 || f.discountPercent > 100) {
      found.discountPercent = 'The discount must be between 1 and 100 percent.'
    }
  }
  if (f.offerType === 'FIXED_PRICE') {
    if (f.priceDollars === '' || f.priceDollars <= 0) found.priceDollars = 'Please enter the deal price.'
  }
  if (!flashMode.value && f.startDate && f.endDate && f.endDate < f.startDate) {
    found.endDate = 'The last day cannot be before the start date.'
  }
  return found
}

// ----- Saving (create or edit) -----
const saveDeal = async () => {
  if (saving.value) return
  formError.value = ''
  const problems = checkForm()
  if (Object.keys(problems).length > 0) return flagFirstProblem(problems, false)
  fieldErrors.value = {}

  const f = form.value
  // Only send a discount or price when the offer type uses it.
  const content: Omit<DealInput, 'photoKey'> = {
    title: f.title.trim(),
    description: f.description.trim(),
    category: f.category,
    cuisine: f.cuisine === 'NONE' ? null : f.cuisine,
    outletIds: f.outletIds,
    offerType: f.offerType,
    discountPercent: f.offerType === 'PERCENT_OFF' ? Number(f.discountPercent) : null,
    priceCents: f.offerType === 'FIXED_PRICE' ? Math.round(Number(f.priceDollars) * 100) : null,
    startDate: f.startDate,
    endDate: f.endDate,
    terms: f.terms.trim(),
  }

  saving.value = true
  try {
    // A newly chosen photo is uploaded first; otherwise keep the saved one (or none).
    const photoKey = newPhoto.value ? await savePhoto(newPhoto.value) : (f.savedPhoto?.key ?? null)
    const input = { ...content, photoKey }
    if (editingId.value === null) {
      const created = await createDeal(input)
      deals.value.unshift(created) // newest first, like the server's list
      successMessage.value = `"${created.title}" is now live.`
    } else {
      const updated = await updateDeal(editingId.value, input)
      // Swap the old copy of the deal in the list for the updated one.
      deals.value = deals.value.map((deal) => (deal.id === updated.id ? updated : deal))
      successMessage.value = `"${updated.title}" was updated.`
    }
    closeForm()
  } catch (error) {
    formError.value = errorMessageFor(error, 'Could not save the deal. Please try again.')
  } finally {
    saving.value = false
  }
}

// ----- Saving as a flash deal (a draft) -----
const saveFlash = async () => {
  if (saving.value) return
  formError.value = ''
  const problems = checkForm()
  const flashTimingBad = checkFlashTiming()
  if (Object.keys(problems).length > 0 || flashTimingBad)
    return flagFirstProblem(problems, flashTimingBad)
  fieldErrors.value = {}
  const f = form.value
  const offer = flashOffer.value

  saving.value = true
  try {
    // A newly chosen photo is uploaded first; otherwise keep the saved one (or none).
    const photoKey = newPhoto.value ? await savePhoto(newPhoto.value) : (f.savedPhoto?.key ?? null)
    const body = toFlashDropBody(
      {
        title: f.title.trim(),
        description: f.description.trim(),
        // The selects only offer the allowed values, and the server checks them again.
        category: f.category as FlashBody['category'],
        cuisine: (f.cuisine === 'NONE' ? null : f.cuisine) as FlashBody['cuisine'],
        // The form's offer is the flash offer.
        offerType: offer.offerType,
        discountPercent: offer.discountPercent,
        priceCents: offer.flashPriceCents,
        terms: f.terms.trim(),
        photoKey,
      },
      f.outletIds[0] ?? '',
      flashFields.value,
    )
    const created = editingFlash.value === null
    const draft = await saveFlashDraft(editingFlash.value, body)
    flashDrops.value?.saved(draft, created)
    closeForm()
  } catch (error) {
    // A failed photo upload has its own message; anything else is the server's.
    const photoFailed = errorMessageFor(error, '')
    formError.value =
      photoFailed ||
      flashDropErrorMessage(error, 'Could not save the flash deal. Please try again.')
  } finally {
    saving.value = false
  }
}

// Enter in a field moves on a step; on the review it saves.
const submitForm = () => {
  if (step.value < LAST_STEP) return next()
  return flashMode.value ? saveFlash() : saveDeal()
}

const formTitle = computed(() => {
  if (flashMode.value) return editingFlash.value ? 'Edit flash deal draft' : 'New flash deal'
  return editingId.value === null ? 'New deal' : 'Edit deal'
})
// In flash mode the form's offer is the flash offer: a discount or price only goes with the
// offer type that uses it.
const flashOffer = computed(() => {
  const f = form.value
  return {
    offerType: f.offerType,
    discountPercent:
      f.offerType === 'PERCENT_OFF' && f.discountPercent !== '' ? Number(f.discountPercent) : null,
    flashPriceCents:
      f.offerType === 'FIXED_PRICE' && f.priceDollars !== ''
        ? Math.round(Number(f.priceDollars) * 100)
        : null,
  }
})

// ----- Ending a deal early -----
const confirmEndDeal = async (deal: MerchantDeal) => {
  const confirmed = await ask({
    title: 'End this deal?',
    body: `"${deal.title}" will stop showing to customers now. It stays in Ended deals.`,
    confirmLabel: 'End deal',
  })
  if (!confirmed) return
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const ended = await endDeal(deal.id)
    deals.value = deals.value.map((item) => (item.id === ended.id ? ended : item))
    successMessage.value = `"${ended.title}" has ended.`
  } catch (error) {
    errorMessage.value = errorMessageFor(error, 'Could not end the deal. Please try again.')
  }
}

// ----- Deleting a scheduled or ended deal -----
// It leaves the map and this page. Live deals are ended instead, so they stay in Ended deals.
const confirmDeleteDeal = async (deal: MerchantDeal) => {
  const confirmed = await ask({
    title: 'Delete this deal?',
    body: `"${deal.title}" will be removed from the map and from this page.`,
    confirmLabel: 'Delete deal',
  })
  if (!confirmed) return
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await deleteDeal(deal.id)
    deals.value = deals.value.filter((item) => item.id !== deal.id)
    successMessage.value = `"${deal.title}" was deleted.`
  } catch (error) {
    errorMessage.value = errorMessageFor(error, 'Could not delete the deal. Please try again.')
  }
}

// ----- Flash deals -----
// The list lives in its own component; the page tells it when a draft was saved.
const flashDrops = ref<InstanceType<typeof FlashDropsSection> | null>(null)

onMounted(loadDashboard)
</script>

<template>
  <section class="container py-4 merchant-dashboard">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h1 class="h2 mb-0">Merchant dashboard</h1>
      <div v-if="!loading && outlets.length > 0" class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-primary" @click="openCreateForm">+ New deal</button>
      </div>
    </div>

    <p v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="alert alert-success" role="status">{{ successMessage }}</p>

    <TicketLoading v-if="loading" class="text-secondary" label="Loading your deals…" />

    <!-- Merchant role, but no approved outlets yet -->
    <div v-else-if="outlets.length === 0 && !errorMessage" class="card card-body">
      <p class="mb-2">You don't manage any outlets yet.</p>
      <RouterLink to="/me/merchant-access">Request access to your stall</RouterLink>
    </div>

    <template v-else-if="outlets.length > 0">
      <p class="text-secondary text-break">
        Your outlets: {{ outlets.map((outlet) => outlet.name).join(', ') }} ·
        <RouterLink to="/me/merchant-access">Request another outlet</RouterLink>
      </p>

      <!-- Create / edit form: the same steps and look as the visitor's Add a deal form
           (AddDealStepper, add-deal-form.css). Every step stays in the form, so moving between
           them keeps what was typed. -->
      <form
        v-if="showForm"
        ref="formEl"
        class="add-deal__panel add-deal__form mb-4 deal-form"
        novalidate
        @submit.prevent="submitForm"
      >
        <div class="deal-form__head">
          <h2 class="deal-form__title">{{ formTitle }}</h2>
          <p v-if="copiedFrom" class="add-deal__hint">
            Copied from "{{ copiedFrom }}". Check the dates and outlets, and add a photo if you want
            one, before saving.
          </p>
        </div>

        <AddDealStepper :current="step" :reached="reached" :labels="stepLabels" nav-label="Deal steps" @go="go" />

        <!-- 1. Deal details -->
        <section v-show="step === 0" class="add-deal__card" data-step="0" aria-labelledby="deal-form-step-0">
          <h3 id="deal-form-step-0" :ref="(el) => { if (el) stepHeadings[0] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="ticket" :size="20" /></span>Deal details
          </h3>
          <p class="add-deal__hint">Fields marked <span aria-hidden="true">*</span><span class="visually-hidden">with a star</span> are required.</p>

          <div class="add-deal__field">
            <label for="deal-title" class="form-label">Title <span class="add-deal__required" aria-hidden="true">*</span></label>
            <input
              id="deal-title"
              v-model="form.title"
              name="title"
              autocomplete="off"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.title }"
              v-bind="invalidAttrs('title')"
              aria-required="true"
              maxlength="120"
              placeholder="e.g. 1-for-1 Nanban chicken bites"
            />
            <div id="error-title" class="invalid-feedback">{{ fieldErrors.title }}</div>
          </div>

          <div class="add-deal__field">
            <label for="deal-description" class="form-label">Description <span class="add-deal__required" aria-hidden="true">*</span></label>
            <div class="add-deal__counted">
              <textarea
                id="deal-description"
                v-model="form.description"
                name="description"
                autocomplete="off"
                class="form-control"
                :class="{ 'is-invalid': fieldErrors.description }"
                v-bind="invalidAttrs('description')"
                aria-required="true"
                rows="3"
                :maxlength="DESCRIPTION_MAX"
                placeholder="Briefly describe the deal…"
              ></textarea>
              <span class="add-deal__count" aria-hidden="true">{{ form.description.length }} / {{ DESCRIPTION_MAX }}</span>
            </div>
            <div id="error-description" class="invalid-feedback">{{ fieldErrors.description }}</div>
          </div>

          <div class="add-deal__pair">
            <div class="add-deal__field">
              <label for="deal-category" class="form-label">Category <span class="add-deal__required" aria-hidden="true">*</span></label>
              <AppSelect
                id="deal-category"
                v-model="form.category"
                name="category"
                class="form-select"
                :class="{ 'is-invalid': fieldErrors.category }"
                v-bind="invalidAttrs('category')"
                :options="categoryOptions"
              />
              <div id="error-category" class="invalid-feedback">{{ fieldErrors.category }}</div>
            </div>
            <div class="add-deal__field">
              <label for="deal-cuisine" class="form-label">Cuisine <span class="add-deal__required" aria-hidden="true">*</span></label>
              <AppSelect
                id="deal-cuisine"
                v-model="form.cuisine"
                name="cuisine"
                class="form-select"
                :class="{ 'is-invalid': fieldErrors.cuisine }"
                v-bind="invalidAttrs('cuisine')"
                :options="cuisineOptions"
              />
              <div id="error-cuisine" class="invalid-feedback">{{ fieldErrors.cuisine }}</div>
            </div>
          </div>

          <fieldset class="add-deal__field">
            <legend class="form-label">{{ flashMode ? 'Flash offer' : 'Offer type' }} <span class="add-deal__required" aria-hidden="true">*</span></legend>
            <div class="add-deal__offers" role="radiogroup" :aria-label="flashMode ? 'Flash offer' : 'Offer type'">
              <label v-for="offer in OFFER_TILES" :key="offer.value" class="add-deal__offer" :class="{ 'is-chosen': form.offerType === offer.value }">
                <input
                  v-model="form.offerType"
                  class="add-deal__offer-input"
                  type="radio"
                  name="offerType"
                  :value="offer.value"
                  :data-testid="`merchant-offer-${offer.value}`"
                />
                <ShellIcon :name="offer.icon" :size="20" />{{ offer.label }}
              </label>
            </div>
          </fieldset>

          <!-- Only the box the chosen offer type needs. -->
          <div v-if="form.offerType === 'PERCENT_OFF'" class="add-deal__field add-deal__short">
            <label for="deal-discount" class="form-label">Discount (%) <span class="add-deal__required" aria-hidden="true">*</span></label>
            <input
              id="deal-discount"
              v-model.number="form.discountPercent"
              name="discountPercent"
              type="number"
              inputmode="numeric"
              autocomplete="off"
              min="1"
              max="100"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.discountPercent }"
              v-bind="invalidAttrs('discountPercent')"
            />
            <div id="error-discountPercent" class="invalid-feedback">{{ fieldErrors.discountPercent }}</div>
          </div>
          <div v-if="form.offerType === 'FIXED_PRICE'" class="add-deal__field add-deal__short">
            <label for="deal-price" class="form-label">{{ flashMode ? 'Flash price ($)' : 'Deal price ($)' }} <span class="add-deal__required" aria-hidden="true">*</span></label>
            <input
              id="deal-price"
              v-model.number="form.priceDollars"
              name="priceDollars"
              type="number"
              inputmode="decimal"
              autocomplete="off"
              min="0.01"
              step="0.01"
              class="form-control"
              :class="{ 'is-invalid': fieldErrors.priceDollars }"
              v-bind="invalidAttrs('priceDollars')"
            />
            <div id="error-priceDollars" class="invalid-feedback">{{ fieldErrors.priceDollars }}</div>
          </div>

          <div class="add-deal__field">
            <label for="deal-photo" class="form-label">{{ shownPhoto ? 'Replace the photo' : 'Photo of the deal' }} <span class="add-deal__hint">(optional)</span></label>
            <p id="deal-photo-help" class="add-deal__hint">JPEG, PNG or WebP, up to 4 MB. A photo of the poster or menu works best.</p>
            <PhotoDropzone
              id="deal-photo"
              ref="photoInput"
              name="photo"
              :has-photo="Boolean(shownPhoto)"
              :class="{ 'is-invalid': fieldErrors.photo }"
              v-bind="invalidAttrs('photo')"
              :aria-describedby="fieldErrors.photo ? 'error-photo' : 'deal-photo-help'"
              @change="choosePhoto"
            />
            <!-- The input sits inside the drop zone, so the error is shown here rather than by
                 Bootstrap's "after an invalid input" rule. -->
            <div id="error-photo" class="invalid-feedback" :class="{ 'd-block': fieldErrors.photo }">{{ fieldErrors.photo }}</div>
            <div v-if="shownPhoto" class="deal-form__photo">
              <img :src="shownPhoto" alt="Your deal, as customers will see it" width="480" height="320" class="add-deal__preview" />
              <button type="button" class="lb-btn add-deal__remove" @click="removePhoto">Remove photo</button>
            </div>
          </div>
        </section>

        <!-- 2. Outlets -->
        <section v-show="step === 1" class="add-deal__card" data-step="1" aria-labelledby="deal-form-step-1">
          <h3 id="deal-form-step-1" :ref="(el) => { if (el) stepHeadings[1] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="pin" :size="20" /></span>Outlets
          </h3>
          <fieldset
            class="add-deal__field"
            :aria-invalid="fieldErrors.outletIds ? 'true' : undefined"
            :aria-describedby="fieldErrors.outletIds ? 'error-outletIds' : undefined"
          >
            <legend class="form-label">
              {{ flashMode ? 'Which outlet is this flash deal at? (one only)' : 'Which outlets is this deal at?' }}
              <span class="add-deal__required" aria-hidden="true">*</span>
            </legend>
            <ul class="add-deal__stalls deal-form__outlets">
              <li v-for="outlet in outlets" :key="outlet.id" :class="{ 'is-chosen': form.outletIds.includes(outlet.id) }">
                <input
                  :id="`outlet-${outlet.id}`"
                  v-model="form.outletIds"
                  name="outletIds"
                  :value="outlet.id"
                  type="checkbox"
                  class="form-check-input deal-form__outlet-check"
                  :class="{ 'is-invalid': fieldErrors.outletIds }"
                />
                <label :for="`outlet-${outlet.id}`" class="add-deal__stall-text deal-form__outlet-label">
                  <strong>{{ outlet.name }}</strong><span>{{ outlet.address }}</span>
                </label>
              </li>
            </ul>
            <p id="error-outletIds" class="add-deal__error" aria-live="polite">{{ fieldErrors.outletIds }}</p>
          </fieldset>
        </section>

        <!-- 3. Validity. A flash deal has its own start time and length instead of dates. -->
        <section v-show="step === 2" class="add-deal__card" data-step="2" aria-labelledby="deal-form-step-2">
          <h3 id="deal-form-step-2" :ref="(el) => { if (el) stepHeadings[2] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="calendar" :size="20" /></span>{{ stepLabels[2] }}
          </h3>
          <div v-if="flashMode" class="flash-holder">
            <FlashDealFields
              v-model="flashFields"
              :title="form.title"
              :offer="flashOffer"
              :problem="flashProblem"
            />
            <button
              v-if="editingFlash === null"
              type="button"
              class="add-deal__edit"
              :disabled="saving"
              @click="backToNormalDeal"
            >
              Make it an ordinary deal
            </button>
          </div>
          <div v-if="!flashMode" class="add-deal__pair">
            <div class="add-deal__field">
              <label for="deal-start" class="form-label">Start date <span class="add-deal__hint">(optional)</span></label>
              <input id="deal-start" v-model="form.startDate" name="startDate" type="date" class="form-control" />
            </div>
            <div class="add-deal__field">
              <label for="deal-end" class="form-label">Last day <span class="add-deal__hint">(optional)</span></label>
              <input
                id="deal-end"
                v-model="form.endDate"
                name="endDate"
                type="date"
                class="form-control"
                :class="{ 'is-invalid': fieldErrors.endDate }"
                v-bind="invalidAttrs('endDate')"
              />
              <div id="error-endDate" class="invalid-feedback">{{ fieldErrors.endDate }}</div>
            </div>
          </div>
          <div class="add-deal__field">
            <label for="deal-terms" class="form-label">Terms &amp; conditions <span class="add-deal__hint">(optional)</span></label>
            <textarea
              id="deal-terms"
              v-model="form.terms"
              name="terms"
              autocomplete="off"
              class="form-control"
              rows="4"
              maxlength="1000"
              placeholder="One condition per line, e.g. Dine-in only…"
            ></textarea>
          </div>
        </section>

        <!-- 4. Review -->
        <section v-show="step === 3" class="add-deal__card" data-step="3" aria-labelledby="deal-form-step-3">
          <h3 id="deal-form-step-3" :ref="(el) => { if (el) stepHeadings[3] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="check" :size="20" /></span>Review
          </h3>
          <p class="add-deal__hint">
            {{ flashMode ? 'Check everything looks right, then save the flash deal as a draft. It goes live when you press Go live.' : 'Check everything looks right, then save. The deal goes live straight away.' }}
          </p>
          <div class="add-deal__review">
            <img v-if="shownPhoto" :src="shownPhoto" alt="Your deal, as customers will see it" width="480" height="320" class="add-deal__preview add-deal__review-photo" />
            <div class="add-deal__review-groups">
              <div v-for="group in review" :key="group.step" class="add-deal__review-group">
                <dl>
                  <div v-for="[term, value] in group.rows" :key="term">
                    <dt>{{ term }}</dt>
                    <dd>{{ value || '—' }}</dd>
                  </div>
                </dl>
                <button type="button" class="add-deal__edit" :data-testid="`merchant-review-edit-${group.step}`" @click="go(group.step)">
                  Edit<span class="visually-hidden"> {{ stepLabels[group.step] }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Always mounted so the summary or a save error is announced. -->
        <div role="alert">
          <p v-if="formError" class="add-deal__alert">{{ formError }}</p>
        </div>

        <div class="add-deal__nav">
          <button type="button" class="lb-btn" data-testid="deal-form-back" @click="back">
            <ShellIcon name="back" :size="18" />{{ step === 0 ? 'Cancel' : 'Back' }}
          </button>
          <button v-if="step < LAST_STEP" type="submit" class="lb-btn lb-btn--primary" data-testid="deal-form-next">
            Next: {{ nextLabel }}<ShellIcon name="arrowRight" :size="18" />
          </button>
          <div v-else class="deal-form__actions">
            <!-- An ordinary deal goes live when saved; a flash deal is saved as a draft. -->
            <template v-if="!flashMode">
              <button
                v-if="editingId === null"
                type="button"
                class="lb-btn"
                :disabled="saving"
                @click="showFlashFields"
              >
                Save as flash deal
              </button>
              <button type="submit" class="lb-btn lb-btn--primary" :disabled="saving">
                {{ saving ? 'Saving…' : 'Save deal' }}
              </button>
            </template>
            <template v-else>
              <button
                v-if="editingFlash === null"
                type="button"
                class="lb-btn"
                :disabled="saving"
                @click="backToNormalDeal"
              >
                Make it an ordinary deal
              </button>
              <button type="submit" class="lb-btn lb-btn--primary" :disabled="saving">
                {{ saving ? 'Saving…' : editingFlash ? 'Save draft' : 'Save as flash deal' }}
              </button>
            </template>
          </div>
        </div>
      </form>

      <!-- Each kind of deal in its own dropdown, with live, draft and scheduled ones open first. -->
      <DealSection title="Current deals" :count="currentDeals.length">
        <DealSection
          v-for="group in currentGroups"
          :key="group.key"
          :title="group.title"
          :count="group.deals.length"
          level="h3"
          :default-open="group.open"
        >
          <p v-if="group.deals.length === 0" class="text-secondary small mb-2">{{ group.empty }}</p>
          <MerchantCardGrid v-else>
            <li v-for="deal in group.deals" :key="deal.id">
              <MerchantDealCard
                :title="deal.title"
                :description="deal.description"
                :offer="offerText(deal)"
                :dates="datesText(deal)"
                :location="`At: ${outletNames(deal)}`"
                :terms="deal.terms"
                :category="deal.category"
                :photo-url="deal.photo?.url ?? null"
                :badge="statusOf(deal)"
                :tone="statusOf(deal) === 'Live' ? 'live' : 'scheduled'"
              >
                <template #actions>
                  <button type="button" class="btn btn-sm btn-outline-primary" @click="openEditForm(deal)">
                    Edit<span class="visually-hidden"> {{ deal.title }}</span>
                  </button>
                  <!-- A live deal is ended; one that has not started yet can simply be deleted. -->
                  <button
                    v-if="statusOf(deal) === 'Scheduled'"
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    @click="confirmDeleteDeal(deal)"
                  >
                    Delete<span class="visually-hidden">: {{ deal.title }}</span>
                  </button>
                  <button v-else type="button" class="btn btn-sm btn-outline-danger" @click="confirmEndDeal(deal)">
                    End deal<span class="visually-hidden">: {{ deal.title }}</span>
                  </button>
                </template>
              </MerchantDealCard>
            </li>
          </MerchantCardGrid>
        </DealSection>
      </DealSection>

      <!-- Flash deals: drafts, live and past. Drafts are edited in the form above. -->
      <FlashDropsSection ref="flashDrops" @edit="openFlashDraftForm" />

      <!-- Ended deals: view only, so closed at first -->
      <DealSection title="Ended deals" :count="endedDeals.length" :default-open="false">
        <p v-if="endedDeals.length === 0" class="text-secondary small mb-2">No ended deals.</p>
        <MerchantCardGrid v-else>
          <li v-for="deal in endedDeals" :key="deal.id">
            <MerchantDealCard
              :title="deal.title"
              :description="deal.description"
              :offer="offerText(deal)"
              :dates="datesText(deal)"
              :location="`At: ${outletNames(deal)}`"
                :terms="deal.terms"
              :category="deal.category"
              :photo-url="deal.photo?.url ?? null"
              badge="Ended"
              tone="ended"
            >
              <template #actions>
                <button type="button" class="btn btn-sm btn-outline-primary" @click="openRunAgainForm(deal)">
                  Run it again<span class="visually-hidden">: {{ deal.title }}</span>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" @click="confirmDeleteDeal(deal)">
                  Delete<span class="visually-hidden">: {{ deal.title }}</span>
                </button>
              </template>
            </MerchantDealCard>
          </li>
        </MerchantCardGrid>
      </DealSection>
    </template>
  </section>
</template>

<style scoped>
/* Wide enough for four deal cards in a row on a large screen. */
.merchant-dashboard {
  max-width: 82rem;
}

/* Leave room above the flash fields when they are scrolled into view. */
.flash-holder {
  scroll-margin-top: 80px;
}

/* The deal form uses the Add a deal look (add-deal-form.css); these few pieces are its own. */
.deal-form__head {
  display: grid;
  gap: 6px;
}

.deal-form__title {
  margin: 0;
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.deal-form__photo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

/* Outlets as tiles like the chosen stalls; a ticked one takes the same sunny wash. */
.deal-form__outlets li {
  position: relative;
  padding: 12px 16px;
  cursor: pointer;
}

.deal-form__outlets li.is-chosen {
  background: var(--sunny-wash);
  border-color: var(--sunny-deep);
}

.deal-form__outlet-check {
  position: relative;
  z-index: 1;
  flex: none;
  margin: 0;
}

/* The whole tile is the label's click target; the checkbox sits above it and takes its own clicks. */
.deal-form__outlet-label {
  cursor: pointer;
}

.deal-form__outlet-label::after {
  position: absolute;
  inset: 0;
  content: '';
}

.deal-form__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

/* On a phone, Back and Next share a row like the visitor's form; the review's save buttons
   stack full width under Back, with the main one on top. */
@media (max-width: 480px) {
  .deal-form .add-deal__nav {
    flex-wrap: wrap;
  }

  .deal-form__actions {
    flex: 1 1 100%;
    flex-direction: column-reverse;
    order: -1;
  }

  .deal-form__actions .lb-btn {
    width: 100%;
  }
}

.btn {
  touch-action: manipulation;
}
/* Comfortable touch targets on phones. */
@media (max-width: 575.98px) {
  .btn-sm {
    min-height: var(--hit);
  }
}
</style>
