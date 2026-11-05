<script setup lang="ts">
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromLabels, withLeading } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { formatDate, formatMoneyMinor } from '@web/lib/format'
import { useUnsavedChanges } from '@web/lib/use-unsaved-changes'
import '@web/modules/add-deal/add-deal-form.css'
import AddDealStepper from '@web/modules/add-deal/AddDealStepper.vue'
import AddDealTip from '@web/modules/add-deal/AddDealTip.vue'
import { DESCRIPTION_MAX } from '@web/modules/add-deal/add-deal-steps'
import { OFFER_TILES } from '@web/modules/add-deal/offer-tiles'
import PhotoDropzone from '@web/modules/add-deal/PhotoDropzone.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import '@web/modules/merchant/merchant.css'
import FlashDealFields from '@web/modules/merchant/FlashDealFields.vue'
import {
  type MerchantFlashDropBody as FlashBody,
  flashDropErrorMessage,
  getFlashDrops,
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
import {
  createDeal,
  type DealInput,
  type DealPhoto,
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
import { leaveMerchantNotice } from '@web/modules/merchant/merchant-notice'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

export type MerchantFormMode = 'new' | 'edit' | 'run-again' | 'flash-new' | 'flash-edit'

const props = defineProps<{ mode: MerchantFormMode; id?: string }>()
const router = useRouter()

const outlets = ref<MerchantOutlet[]>([])
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const loadError = ref('')

const editingId = ref<string | null>(null)
const copiedFrom = ref<string | null>(null)
const flashMode = ref(false)
const editingFlash = ref<MerchantFlashDrop | null>(null)
const flashFields = ref<FlashFieldsState>(blankFlashFields())
const flashProblem = ref<FlashProblem | null>(null)
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const formEl = ref<HTMLFormElement | null>(null)

const emptyForm = () => ({
  title: '',
  description: '',
  category: '',
  cuisine: '',
  outletIds: [] as string[],
  offerType: 'PERCENT_OFF' as OfferType,
  discountPercent: '' as number | '',
  priceDollars: '' as number | '',
  startDate: '',
  endDate: '',
  terms: '',
  savedPhoto: null as DealPhoto | null,
})
const form = ref(emptyForm())
const newPhoto = ref<File | null>(null)
const newPhotoPreview = ref('')
const photoInput = ref<InstanceType<typeof PhotoDropzone> | null>(null)
const openedAs = ref('')
const snapshot = () =>
  JSON.stringify({ form: form.value, flash: flashMode.value ? flashFields.value : null })
const isDirty = computed(
  () =>
    !loading.value &&
    !saved.value &&
    loadError.value === '' &&
    (snapshot() !== openedAs.value || newPhoto.value !== null),
)
const { discarding } = useUnsavedChanges(isDirty)
const leaving = computed(() => discarding.value || saved.value)

const invalidAttrs = (field: string) =>
  fieldErrors.value[field]
    ? { 'aria-invalid': 'true' as const, 'aria-describedby': `error-${field}` }
    : {}

const STEP_FIELDS: readonly (readonly string[])[] = [
  ['title', 'description', 'category', 'cuisine', 'discountPercent', 'priceDollars', 'photo'],
  ['outletIds'],
  ['endDate'],
  [],
]
const LAST_STEP = STEP_FIELDS.length - 1
const TIMING_STEP = 2
const step = ref(0)
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

const go = async (target: number) => {
  step.value = target
  reached.value = Math.max(reached.value, target)
  formError.value = ''
  await nextTick()
  stepHeadings.value[target]?.focus()
  formEl.value?.scrollIntoView?.({ block: 'start' })
}

const categoryLabels: Record<string, string> = {
  FOOD: 'Food',
  DRINKS: 'Drinks',
  DESSERT: 'Dessert',
  SNACKS: 'Snacks',
  BAKERY: 'Bakery',
}
const cuisineLabels: Record<string, string> = {
  ...DEAL_CUISINE_LABELS,
  NONE: 'No specific cuisine (e.g. drinks, desserts)',
}

const categoryOptions = withLeading({ value: '', label: 'Choose a category' }, optionsFromLabels(categoryLabels))
const cuisineOptions = withLeading({ value: '', label: 'Choose a cuisine' }, optionsFromLabels(cuisineLabels))

const TIPS = [
  {
    sprite: 'deal-found',
    title: 'Tip for a great deal!',
    points: ['Use a clear and catchy title', 'Say exactly what people get (e.g. 1-for-1, % off)', 'Add a real photo of the dish'],
  },
  {
    sprite: 'idle-peek',
    title: 'Choosing your outlets',
    points: ['Tick every outlet that runs the deal', 'A flash deal runs at one outlet only', 'Need another outlet? Request it from the dashboard'],
  },
  {
    sprite: 'thinking',
    title: 'Getting the dates right',
    points: ['Leave the start empty to go live today', 'The last day is the final day the deal runs', 'Put each condition on its own line'],
  },
  {
    sprite: 'hello',
    title: 'Almost there!',
    points: ['Check the price and dates once more', 'Your deal goes on the map as soon as you save', 'End or edit it any time from your dashboard'],
  },
] as const
const FLASH_TIMING_TIP = {
  sprite: 'thinking',
  title: 'Timing a flash deal',
  points: ['Short windows (15 to 30 min) create a buzz', 'Give out only as many codes as you can serve', 'It stays a draft until you press Go live'],
} as const
const FLASH_REVIEW_TIP = {
  sprite: 'hello',
  title: 'Almost there!',
  points: ['Check the flash price and codes once more', 'Saving keeps it as a draft, hidden from everyone', 'Press Go live on your dashboard when you are ready'],
} as const
const tip = computed(() => {
  if (flashMode.value && step.value === TIMING_STEP) return FLASH_TIMING_TIP
  if (flashMode.value && step.value === LAST_STEP) return FLASH_REVIEW_TIP
  return TIPS[step.value] ?? TIPS[0]
})

const clearNewPhoto = () => {
  newPhoto.value = null
  newPhotoPreview.value = ''
  photoInput.value?.clear()
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

const removePhoto = () => {
  clearNewPhoto()
  form.value.savedPhoto = null
}

const shownPhoto = computed(() => newPhotoPreview.value || form.value.savedPhoto?.url || '')

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

const fillBlank = () => {
  form.value = emptyForm()
  if (outlets.value.length === 1) form.value.outletIds = outlets.value.map((outlet) => outlet.id)
}

const fillRunAgain = (deal: MerchantDeal) => {
  const managed = new Set(outlets.value.map((outlet) => outlet.id))
  form.value = {
    ...formFrom(deal),
    outletIds: deal.outletIds.filter((id) => managed.has(id)),
    startDate: '',
    endDate: '',
    savedPhoto: null,
  }
  copiedFrom.value = deal.title
}

const fillFlashDraft = (drop: MerchantFlashDrop) => {
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
  flashMode.value = true
  editingFlash.value = drop
  flashFields.value = flashFieldsFromDrop(drop)
}

const NOT_FOUND: Record<MerchantFormMode, string> = {
  new: '',
  'flash-new': '',
  edit: 'We could not find that deal. It may have been deleted.',
  'run-again': 'We could not find that deal. It may have been deleted.',
  'flash-edit': 'We could not find that flash deal draft. It may have gone live or been deleted.',
}

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    outlets.value = await getOutlets()
    if (props.mode === 'new' || props.mode === 'flash-new') {
      fillBlank()
      if (props.mode === 'flash-new') {
        flashMode.value = true
        form.value.outletIds = form.value.outletIds.slice(0, 1)
      }
    } else if (props.mode === 'flash-edit') {
      const drop = (await getFlashDrops()).find(
        (item) => item.id === props.id && item.status === 'DRAFT',
      )
      if (!drop) loadError.value = NOT_FOUND[props.mode]
      else fillFlashDraft(drop)
    } else {
      const deal = (await getDeals()).find((item) => item.id === props.id)
      if (!deal) loadError.value = NOT_FOUND[props.mode]
      else if (props.mode === 'run-again') fillRunAgain(deal)
      else {
        form.value = formFrom(deal)
        editingId.value = deal.id
      }
    }
  } catch (error) {
    loadError.value = errorMessageFor(error, 'Could not open the deal form. Please try again.')
  } finally {
    const prefilled = props.mode !== 'new' && props.mode !== 'flash-new'
    step.value = 0
    reached.value = prefilled ? LAST_STEP : 0
    openedAs.value = snapshot()
    loading.value = false
  }
}

const showFlashFields = async () => {
  flashMode.value = true
  form.value.outletIds = form.value.outletIds.slice(0, 1)
  await go(TIMING_STEP)
}

const backToNormalDeal = () => {
  flashMode.value = false
  flashProblem.value = null
}

const dashboard = computed(() => ({
  name: 'merchant',
  query: flashMode.value || props.mode === 'flash-edit' ? { tab: 'flash' } : {},
}))
const cancelForm = () => router.push(dashboard.value)

const finish = async (text: string) => {
  saved.value = true
  clearNewPhoto()
  leaveMerchantNotice({ tone: 'success', text })
  await router.push(dashboard.value)
}

const flagStep = async (target: number, problems: Record<string, string>) => {
  if (step.value !== target) await go(target)
  fieldErrors.value = problems
  formError.value = 'Please fix the highlighted fields.'
  await nextTick()
  focusFirstInvalid(formEl.value?.querySelector(`[data-step="${target}"]`))
}

const problemsIn = (problems: Record<string, string>, target: number) =>
  Object.fromEntries(Object.entries(problems).filter(([field]) => stepOf(field) === target))

const checkFlashTiming = () => {
  const offer = flashOffer.value
  flashProblem.value = flashFieldsProblem(
    flashFields.value,
    { offerType: offer.offerType, priceCents: offer.flashPriceCents },
    new Date(),
  )
  return flashProblem.value !== null
}

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

const saveDeal = async () => {
  if (saving.value) return
  formError.value = ''
  const problems = checkForm()
  if (Object.keys(problems).length > 0) return flagFirstProblem(problems, false)
  fieldErrors.value = {}

  const f = form.value
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
    const photoKey = newPhoto.value ? await savePhoto(newPhoto.value) : (f.savedPhoto?.key ?? null)
    const input = { ...content, photoKey }
    if (editingId.value === null) {
      const created = await createDeal(input)
      await finish(`"${created.title}" is now live.`)
    } else {
      const updated = await updateDeal(editingId.value, input)
      await finish(`"${updated.title}" was updated.`)
    }
  } catch (error) {
    formError.value = errorMessageFor(error, 'Could not save the deal. Please try again.')
  } finally {
    saving.value = false
  }
}

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
    const photoKey = newPhoto.value ? await savePhoto(newPhoto.value) : (f.savedPhoto?.key ?? null)
    const body = toFlashDropBody(
      {
        title: f.title.trim(),
        description: f.description.trim(),
        category: f.category as FlashBody['category'],
        cuisine: (f.cuisine === 'NONE' ? null : f.cuisine) as FlashBody['cuisine'],
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
    await finish(
      created
        ? `“${draft.dealTitle}” was saved as a draft. Press Go live when you are ready.`
        : `The draft “${draft.dealTitle}” was updated.`,
    )
  } catch (error) {
    const photoFailed = errorMessageFor(error, '')
    formError.value =
      photoFailed ||
      flashDropErrorMessage(error, 'Could not save the flash deal. Please try again.')
  } finally {
    saving.value = false
  }
}

const submitForm = () => {
  if (step.value < LAST_STEP) return next()
  return flashMode.value ? saveFlash() : saveDeal()
}

const formTitle = computed(() => {
  if (flashMode.value) return editingFlash.value ? 'Edit flash deal draft' : 'New flash deal'
  return editingId.value === null ? 'New deal' : 'Edit deal'
})
const formLede = computed(() =>
  flashMode.value
    ? 'A short burst offer that everyone on LoBangers is told about. It saves as a draft, and nobody sees it until you press Go live.'
    : 'It goes on the map as soon as you save it.',
)
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

onMounted(load)
</script>

<template>
  <section class="merchant-page deal-form-page">
    <header class="deal-form-page__head">
      <RouterLink :to="dashboard" class="merchant-back"><ShellIcon name="back" :size="16" />Back to dashboard</RouterLink>
      <h1 class="merchant-title deal-form-page__title">
        <span v-if="flashMode" class="deal-form-page__flash" aria-hidden="true"><ShellIcon name="flash" :size="24" /></span>{{ formTitle }}
      </h1>
      <p v-if="!loading && !loadError" class="deal-form-page__lede">{{ formLede }}</p>
      <p v-if="copiedFrom" class="add-deal__hint">
        Copied from "{{ copiedFrom }}". Check the dates and outlets, and add a photo if you want
        one, before saving.
      </p>
    </header>

    <TicketLoading v-if="loading" label="Opening the deal form…" />

    <div v-else-if="loadError" class="lb-state" role="alert">
      <p class="lb-state__title">This form can't open</p>
      <p class="lb-state__body">{{ loadError }}</p>
      <RouterLink :to="dashboard" class="lb-btn lb-btn--primary deal-form-page__state-action">Back to dashboard</RouterLink>
    </div>

    <div v-else-if="outlets.length === 0" class="lb-state">
      <p class="lb-state__title">No outlets yet</p>
      <p class="lb-state__body">You need an approved outlet before you can add deals.</p>
      <RouterLink to="/me/merchant-access" class="lb-btn lb-btn--primary deal-form-page__state-action">Request access to your stall</RouterLink>
    </div>

    <form
      v-else
      ref="formEl"
      class="add-deal__panel add-deal__form deal-form"
      novalidate
      @submit.prevent="submitForm"
    >
        <AddDealStepper :current="step" :reached="reached" :labels="stepLabels" nav-label="Deal steps" @go="go" />

        <section v-show="step === 0" class="add-deal__card" data-step="0" aria-labelledby="deal-form-step-0">
          <h2 id="deal-form-step-0" :ref="(el) => { if (el) stepHeadings[0] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="ticket" :size="20" /></span>Deal details
          </h2>
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
            <div id="error-photo" class="invalid-feedback" :class="{ 'd-block': fieldErrors.photo }">{{ fieldErrors.photo }}</div>
            <div v-if="shownPhoto" class="deal-form__photo">
              <img :src="shownPhoto" alt="Your deal, as customers will see it" width="480" height="320" class="add-deal__preview" />
              <button type="button" class="lb-btn add-deal__remove" @click="removePhoto">Remove photo</button>
            </div>
          </div>
        </section>

        <section v-show="step === 1" class="add-deal__card" data-step="1" aria-labelledby="deal-form-step-1">
          <h2 id="deal-form-step-1" :ref="(el) => { if (el) stepHeadings[1] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="pin" :size="20" /></span>Outlets
          </h2>
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

        <section v-show="step === 2" class="add-deal__card" data-step="2" aria-labelledby="deal-form-step-2">
          <h2 id="deal-form-step-2" :ref="(el) => { if (el) stepHeadings[2] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="calendar" :size="20" /></span>{{ stepLabels[2] }}
          </h2>
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
              :disabled="saving || leaving"
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

        <section v-show="step === 3" class="add-deal__card" data-step="3" aria-labelledby="deal-form-step-3">
          <h2 id="deal-form-step-3" :ref="(el) => { if (el) stepHeadings[3] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon name="check" :size="20" /></span>Review
          </h2>
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

        <AddDealTip v-bind="tip" />

        <div role="alert">
          <p v-if="formError" class="add-deal__alert">{{ formError }}</p>
        </div>

        <div class="add-deal__nav">
          <button type="button" class="lb-btn" data-testid="deal-form-back" :disabled="leaving" @click="back">
            <ShellIcon name="back" :size="18" />{{ leaving ? 'Leaving…' : step === 0 ? 'Cancel' : 'Back' }}
          </button>
          <button v-if="step < LAST_STEP" type="submit" class="lb-btn lb-btn--primary" data-testid="deal-form-next">
            Next: {{ nextLabel }}<ShellIcon name="arrowRight" :size="18" />
          </button>
          <div v-else class="deal-form__actions">
            <template v-if="!flashMode">
              <button
                v-if="editingId === null"
                type="button"
                class="lb-btn"
                :disabled="saving || leaving"
                @click="showFlashFields"
              >
                Save as flash deal
              </button>
              <button type="submit" class="lb-btn lb-btn--primary" :disabled="saving || leaving">
                {{ saving ? 'Saving…' : 'Save deal' }}
              </button>
            </template>
            <template v-else>
              <button
                v-if="editingFlash === null"
                type="button"
                class="lb-btn"
                :disabled="saving || leaving"
                @click="backToNormalDeal"
              >
                Make it an ordinary deal
              </button>
              <button type="submit" class="lb-btn lb-btn--primary" :disabled="saving || leaving">
                {{ saving ? 'Saving…' : editingFlash ? 'Save draft' : 'Save as flash deal' }}
              </button>
            </template>
          </div>
        </div>
    </form>
  </section>
</template>

<style scoped>
.deal-form-page {
  display: grid;
  gap: 24px;
  max-width: 64rem;
}

.deal-form-page__head {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.deal-form-page__title {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.deal-form-page__flash {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: var(--sunny-wash, var(--sunny-soft));
  color: var(--coral);
}

.deal-form-page__lede {
  margin: 0;
  max-width: 46rem;
  color: var(--ink-muted);
  font-size: 1rem;
}

.deal-form-page__state-action {
  justify-self: start;
  align-self: flex-start;
}

.flash-holder {
  scroll-margin-top: 80px;
}

.deal-form__photo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

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

@media (max-width: 575.98px) {
  .deal-form.add-deal__panel {
    gap: 16px;
    padding: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .deal-form :deep(.add-deal__card) {
    padding: 18px 16px;
  }

  .deal-form :deep(.add-deal-tip) {
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
  }

  .deal-form :deep(.add-deal-tip__lobbie) {
    width: 64px;
  }
}

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
</style>
