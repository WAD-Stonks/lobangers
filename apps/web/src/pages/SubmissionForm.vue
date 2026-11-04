<script setup lang="ts">
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import { BModal } from '@broke-oclock/ui'
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromLabels, withLeading } from '@web/components/select-options'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { useUnsavedChanges } from '@web/lib/use-unsaved-changes'
import AddDealStepper from '@web/modules/add-deal/AddDealStepper.vue'
import AddDealTip from '@web/modules/add-deal/AddDealTip.vue'
import {
  errorMessageFor,
  MAX_PHOTO_BYTES,
  type OfferType,
  PHOTO_TYPES,
  type Stall,
  searchStalls,
  submitDeal,
} from '@web/modules/add-deal/add-deal-api'
import {
  ADD_DEAL_STEPS,
  checkDeal,
  DESCRIPTION_MAX,
  type DealErrors,
  emptyDealForm,
  errorsForStep,
  firstStepWithErrors,
  LAST_STEP,
  toNewDeal,
} from '@web/modules/add-deal/add-deal-steps'
import ShellIcon, { type ShellIconName } from '@web/modules/map-shell/ShellIcon.vue'

const StallMapPicker = defineAsyncComponent(() => import('@web/modules/add-deal/StallMapPicker.vue'))

import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'

// ----- Choices -----
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
const OFFERS: readonly { value: OfferType; label: string; icon: ShellIconName }[] = [
  { value: 'BUY_ONE_GET_ONE', label: '1-for-1', icon: 'gift' },
  { value: 'PERCENT_OFF', label: 'Discount', icon: 'percent' },
  { value: 'FIXED_PRICE', label: 'Fixed price', icon: 'tag' },
  { value: 'OTHER', label: 'Others', icon: 'more' },
]
const categoryOptions = withLeading({ value: '', label: 'Choose a category' }, optionsFromLabels(categoryLabels))
const cuisineOptions = withLeading({ value: '', label: 'Choose a cuisine' }, optionsFromLabels(cuisineLabels))

// Each step's heading icon, and Lobbie's advice for it.
const STEP_ICONS: readonly ShellIconName[] = ['ticket', 'pin', 'calendar', 'check']
const TIPS = [
  {
    sprite: 'deal-found',
    title: 'Tip for a great deal!',
    points: ['Use a clear and catchy title', 'Include key details (e.g. 1-for-1, % off)', 'Add a real photo of the deal'],
  },
  {
    sprite: 'idle-peek',
    title: 'Finding the right stall',
    points: ['Search by the stall or shop name', 'Not listed yet? Find it on the map', 'Add every outlet that runs the deal'],
  },
  {
    sprite: 'thinking',
    title: 'Getting the dates right',
    points: ['Use the dates on the poster or menu', 'The last day is the final day the deal runs', 'Put each condition on its own line'],
  },
  {
    sprite: 'hello',
    title: 'Almost there!',
    points: ['Check the details match the poster', 'An admin checks every deal before it goes live', 'Find it in My deal submissions once it is sent'],
  },
] as const

// ----- Form -----
const form = ref(emptyDealForm())
const photo = ref<File | null>(null)
const photoPreview = ref('') // a temporary link to the chosen image, for the <img> preview
const chosenStalls = ref<Stall[]>([])

// One message per field, e.g. errors.title = 'Please give the deal a title.'
const errors = ref<DealErrors>({})
const submitting = ref(false)
const errorMessage = ref('') // shown above the form when fields need fixing
const formEl = ref<HTMLFormElement | null>(null)

// Links a field to its error text so screen readers read the message with the field.
const invalidAttrs = (field: string) =>
  errors.value[field] ? { 'aria-invalid': 'true' as const, 'aria-describedby': `error-${field}` } : {}

// Anything typed, chosen or uploaded counts as unsaved work worth a warning before leaving.
const isDirty = computed(
  () =>
    JSON.stringify(form.value) !== JSON.stringify(emptyDealForm()) ||
    chosenStalls.value.length > 0 ||
    photo.value !== null,
)
useUnsavedChanges(isDirty)

// Today's date as 'YYYY-MM-DD' in the user's own time zone, to compare with the date boxes.
const today = new Date().toLocaleDateString('en-CA')
const findProblems = () =>
  checkDeal(form.value, { stallCount: chosenStalls.value.length, hasPhoto: photo.value !== null, today })

// ----- Steps -----
const step = ref(0)
// The furthest step opened so far; the stepper reopens any of these.
const reached = ref(0)
const stepHeadings = ref<HTMLElement[]>([])
const nextLabel = computed(() => ADD_DEAL_STEPS[step.value + 1]?.label ?? '')

// Opens a step and moves focus to its heading, so keyboard and screen reader users land on it.
const go = async (target: number) => {
  step.value = target
  reached.value = Math.max(reached.value, target)
  errorMessage.value = ''
  await nextTick()
  stepHeadings.value[target]?.focus()
  formEl.value?.closest('.add-deal')?.scrollIntoView?.({ block: 'start' })
}

// Shows this step's problems and focuses the first one.
const flagStep = async (problems: DealErrors) => {
  errors.value = problems
  errorMessage.value = 'Please fix the highlighted fields.'
  await nextTick()
  focusFirstInvalid(formEl.value?.querySelector(`[data-step="${step.value}"]`))
}

const next = async () => {
  const problems = errorsForStep(findProblems(), step.value)
  if (Object.keys(problems).length) return flagStep(problems)
  errors.value = {}
  await go(step.value + 1)
}

const back = () => (step.value === 0 ? goBack() : go(step.value - 1))

// ----- Stall search -----
const stallSearch = ref('')
const stallResults = ref<Stall[]>([])
const searching = ref(false)
const searchMessage = ref('')
const searched = ref(false)

const findStalls = async () => {
  if (searching.value) return // Enter pressed again while a search is still running
  searching.value = true
  searchMessage.value = ''
  try {
    stallResults.value = await searchStalls(stallSearch.value)
    searched.value = true
    if (stallResults.value.length === 0)
      searchMessage.value = 'No stalls found. Try other words, or find the stall on the map.'
  } catch (error) {
    searchMessage.value = errorMessageFor(error, 'Could not search stalls. Please try again.')
  } finally {
    searching.value = false
  }
}

const isChosen = (stall: Stall) => chosenStalls.value.some((chosen) => chosen.id === stall.id)
const addStall = (stall: Stall) => {
  if (!isChosen(stall)) chosenStalls.value.push(stall)
  delete errors.value.stalls
}
const removeStall = (stall: Stall) => {
  chosenStalls.value = chosenStalls.value.filter((chosen) => chosen.id !== stall.id)
}

const mapOpen = ref(false)
const mapSearch = ref('')
const toggleMap = () => {
  if (!mapOpen.value) {
    mapSearch.value = stallSearch.value
    stallSearch.value = ''
    stallResults.value = []
    searchMessage.value = ''
  }
  mapOpen.value = !mapOpen.value
}
const addFromMap = (stall: Stall) => {
  const already = isChosen(stall)
  addStall(stall)
  mapOpen.value = false
  searchMessage.value = already ? `${stall.name} is already on this deal.` : `${stall.name} is added to this deal.`
}

// ----- Photo -----
const choosePhoto = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  delete errors.value.photo
  if (file === null) return

  if (!PHOTO_TYPES.includes(file.type)) {
    errors.value.photo = 'Please choose a JPEG, PNG or WebP image.'
    input.value = '' // clear the file box
    return
  }
  if (file.size > MAX_PHOTO_BYTES) {
    errors.value.photo = 'The image must be 4 MB or smaller.'
    input.value = ''
    return
  }
  photo.value = file
  photoPreview.value = URL.createObjectURL(file)
}

// ----- Review -----
const dayFormat = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const formatDay = (day: string) => (day ? dayFormat.format(new Date(`${day}T00:00:00Z`)) : '')
const offerSummary = computed(() => {
  const f = form.value
  const label = OFFERS.find((offer) => offer.value === f.offerType)?.label ?? ''
  if (f.offerType === 'PERCENT_OFF' && f.discountPercent !== '') return `${f.discountPercent}% off`
  if (f.offerType === 'FIXED_PRICE' && f.priceDollars !== '') return `Fixed price, $${Number(f.priceDollars).toFixed(2)}`
  return label
})
const review = computed(() => [
  {
    step: 0,
    rows: [
      ['Title', form.value.title.trim()],
      ['Description', form.value.description.trim()],
      ['Category', categoryLabels[form.value.category] ?? ''],
      ['Cuisine', cuisineLabels[form.value.cuisine] ?? ''],
      ['Offer', offerSummary.value],
    ],
  },
  { step: 1, rows: [['Stalls', chosenStalls.value.map((stall) => stall.name).join(', ')]] },
  {
    step: 2,
    rows: [
      ['Runs', [formatDay(form.value.startDate), formatDay(form.value.endDate)].filter(Boolean).join(' to ')],
      ['Terms', form.value.terms.trim()],
    ],
  },
])

// ----- Pop-up -----
// The pop-up (a Bootstrap modal) opens after a submit succeeds or fails.
const showPopup = ref(false)
const popupTitle = ref('')
const popupMessage = ref('')
const openPopup = (title: string, message: string) => {
  popupTitle.value = title
  popupMessage.value = message
  showPopup.value = true
}

// ----- Submitting -----
// Enter in a field moves on a step; on Review it sends the deal.
const onSubmit = () => (step.value < LAST_STEP ? next() : sendDeal())

const sendDeal = async () => {
  const problems = findProblems()
  const first = firstStepWithErrors(problems)
  if (first !== null) {
    await go(first)
    return flagStep(errorsForStep(problems, first))
  }
  errorMessage.value = ''
  submitting.value = true
  try {
    await submitDeal(toNewDeal(form.value, chosenStalls.value), photo.value as File)
  } catch (error) {
    openPopup('Could not submit', errorMessageFor(error, 'Could not submit the deal. Please try again.'))
    return
  } finally {
    submitting.value = false
  }
  clearForm()
  await router.replace({ path: '/me/submissions', query: { submitted: '1' } })
}

// Empties every field and goes back to the first step, so the user can add another deal.
const photoInput = ref<HTMLInputElement | null>(null)
const clearForm = () => {
  form.value = emptyDealForm()
  chosenStalls.value = []
  stallResults.value = []
  stallSearch.value = ''
  photo.value = null
  photoPreview.value = ''
  if (photoInput.value) photoInput.value.value = ''
  errors.value = {}
  step.value = 0
  reached.value = 0
}

const router = useRouter()
const goBack = () => {
  if (router.options.history.state.back) router.back()
  else void router.push('/deals')
}
</script>

<template>
  <section class="add-deal">
    <header class="add-deal__hero">
      <div class="add-deal__intro">
        <button type="button" class="add-deal__back" @click="goBack"><ShellIcon name="back" :size="16" />Back</button>
        <h1 class="add-deal__title">Add a deal</h1>
        <p class="add-deal__lede">
          It only takes a minute to share a deal! An admin checks every deal before it appears on the map.
        </p>
      </div>
    </header>

    <div class="add-deal__panel">
      <AddDealStepper :current="step" :reached="reached" @go="go" />

      <p v-if="errorMessage" class="add-deal__alert" role="alert">{{ errorMessage }}</p>

      <!-- Pop-up after submitting. v-model opens/closes it; OK closes it. -->
      <BModal v-model="showPopup" :title="popupTitle" centered ok-only ok-title="OK">
        <p class="mb-0">{{ popupMessage }}</p>
      </BModal>

      <!-- Every step stays in the form, so moving between them keeps what was typed. -->
      <form ref="formEl" class="add-deal__form" novalidate @submit.prevent="onSubmit">
        <!-- 1. Deal details -->
        <section v-show="step === 0" class="add-deal__card" data-step="0" aria-labelledby="add-deal-step-0">
          <h2 id="add-deal-step-0" :ref="(el) => { if (el) stepHeadings[0] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon :name="STEP_ICONS[0] ?? 'ticket'" :size="20" /></span>Deal details
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
              :class="{ 'is-invalid': errors.title }"
              v-bind="invalidAttrs('title')"
              aria-required="true"
              maxlength="120"
              placeholder="e.g. 1-for-1 Nanban chicken bites"
            />
            <div id="error-title" class="invalid-feedback">{{ errors.title }}</div>
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
                :class="{ 'is-invalid': errors.description }"
                v-bind="invalidAttrs('description')"
                aria-required="true"
                rows="3"
                :maxlength="DESCRIPTION_MAX"
                placeholder="Briefly describe the deal…"
              ></textarea>
              <span class="add-deal__count" aria-hidden="true">{{ form.description.length }} / {{ DESCRIPTION_MAX }}</span>
            </div>
            <div id="error-description" class="invalid-feedback">{{ errors.description }}</div>
          </div>

          <div class="add-deal__pair">
            <div class="add-deal__field">
              <label for="deal-category" class="form-label">Category <span class="add-deal__required" aria-hidden="true">*</span></label>
              <AppSelect
                id="deal-category"
                v-model="form.category"
                name="category"
                class="form-select"
                :class="{ 'is-invalid': errors.category }"
                v-bind="invalidAttrs('category')"
                :options="categoryOptions"
              />
              <div id="error-category" class="invalid-feedback">{{ errors.category }}</div>
            </div>
            <div class="add-deal__field">
              <label for="deal-cuisine" class="form-label">Cuisine <span class="add-deal__required" aria-hidden="true">*</span></label>
              <AppSelect
                id="deal-cuisine"
                v-model="form.cuisine"
                name="cuisine"
                class="form-select"
                :class="{ 'is-invalid': errors.cuisine }"
                v-bind="invalidAttrs('cuisine')"
                :options="cuisineOptions"
              />
              <div id="error-cuisine" class="invalid-feedback">{{ errors.cuisine }}</div>
            </div>
          </div>

          <fieldset class="add-deal__field" :aria-describedby="errors.offerType ? 'error-offerType' : undefined">
            <legend class="form-label">Offer type <span class="add-deal__required" aria-hidden="true">*</span></legend>
            <div class="add-deal__offers" :class="{ 'is-invalid-group': errors.offerType }" role="radiogroup" aria-label="Offer type">
              <label v-for="offer in OFFERS" :key="offer.value" class="add-deal__offer" :class="{ 'is-chosen': form.offerType === offer.value }">
                <input
                  v-model="form.offerType"
                  class="add-deal__offer-input"
                  :class="{ 'is-invalid': errors.offerType && offer === OFFERS[0] }"
                  type="radio"
                  name="offerType"
                  :value="offer.value"
                  :data-testid="`offer-${offer.value}`"
                />
                <ShellIcon :name="offer.icon" :size="20" />{{ offer.label }}
              </label>
            </div>
            <p id="error-offerType" class="add-deal__error" aria-live="polite">{{ errors.offerType }}</p>
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
              :class="{ 'is-invalid': errors.discountPercent }"
              v-bind="invalidAttrs('discountPercent')"
            />
            <div id="error-discountPercent" class="invalid-feedback">{{ errors.discountPercent }}</div>
          </div>
          <div v-if="form.offerType === 'FIXED_PRICE'" class="add-deal__field add-deal__short">
            <label for="deal-price" class="form-label">Deal price ($) <span class="add-deal__required" aria-hidden="true">*</span></label>
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
              :class="{ 'is-invalid': errors.priceDollars }"
              v-bind="invalidAttrs('priceDollars')"
            />
            <div id="error-priceDollars" class="invalid-feedback">{{ errors.priceDollars }}</div>
          </div>

          <div class="add-deal__field">
            <label for="deal-photo" class="form-label">Photo of the deal <span class="add-deal__required" aria-hidden="true">*</span></label>
            <p id="deal-photo-help" class="add-deal__hint">JPEG, PNG or WebP, up to 4 MB. A photo of the poster or menu works best.</p>
            <input
              id="deal-photo"
              ref="photoInput"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="form-control"
              :class="{ 'is-invalid': errors.photo }"
              v-bind="invalidAttrs('photo')"
              :aria-describedby="errors.photo ? 'error-photo' : 'deal-photo-help'"
              @change="choosePhoto"
            />
            <div id="error-photo" class="invalid-feedback">{{ errors.photo }}</div>
            <img v-if="photoPreview" :src="photoPreview" alt="Your chosen deal" width="480" height="320" class="add-deal__preview" />
          </div>
        </section>

        <!-- 2. Location -->
        <section v-show="step === 1" class="add-deal__card" data-step="1" aria-labelledby="add-deal-step-1">
          <h2 id="add-deal-step-1" :ref="(el) => { if (el) stepHeadings[1] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon :name="STEP_ICONS[1] ?? 'pin'" :size="20" /></span>Location
          </h2>
          <div class="add-deal__field">
            <label for="stall-search" class="form-label">Find the stall <span class="add-deal__required" aria-hidden="true">*</span></label>
            <div class="add-deal__search">
              <input
                id="stall-search"
                v-model="stallSearch"
                name="stall-search"
                type="search"
                autocomplete="off"
                class="form-control"
                :class="{ 'is-invalid': errors.stalls }"
                v-bind="invalidAttrs('stalls')"
                maxlength="100"
                placeholder="Stall or shop name…"
                @keydown.enter.prevent="findStalls"
              />
              <button type="button" class="lb-btn" :disabled="searching" @click="findStalls">
                <ShellIcon name="search" :size="18" />{{ searching ? 'Searching…' : 'Search' }}
              </button>
            </div>
            <div role="status">
              <p v-if="searchMessage" class="add-deal__hint mt-2 mb-0">{{ searchMessage }}</p>
            </div>
          </div>

          <!-- Search results: Add puts a stall on the deal. -->
          <ul v-if="stallResults.length > 0" class="add-deal__stalls">
            <li v-for="stall in stallResults" :key="stall.id">
              <span class="add-deal__stall-text"><strong>{{ stall.name }}</strong><span>{{ stall.address }}</span></span>
              <button type="button" class="lb-btn" :disabled="isChosen(stall)" @click="addStall(stall)">
                {{ isChosen(stall) ? 'Added' : 'Add' }}
              </button>
            </li>
          </ul>

          <div v-if="searched" class="add-deal__missing">
            <p class="add-deal__hint mb-0">Can't find the existing stall?</p>
            <button type="button" class="lb-btn" :aria-expanded="mapOpen" aria-controls="stall-map" @click="toggleMap">
              <ShellIcon :name="mapOpen ? 'close' : 'plus'" :size="18" />{{ mapOpen ? 'Close the map' : 'Add new stall' }}
            </button>
          </div>
          <StallMapPicker
            v-if="searched && mapOpen"
            id="stall-map"
            :initial-search="mapSearch"
            :chosen-ids="chosenStalls.map((chosen) => chosen.id)"
            @add="addFromMap"
          />

          <!-- <p class="form-label mt-3 mb-2">Stalls with this deal</p> -->
          <p v-if="chosenStalls.length === 0" class="add-deal__hint mb-0">
            No stalls added yet. Search above and click Add. 
          </p>
          <ul v-else class="add-deal__stalls add-deal__stalls--chosen">
            <li v-for="stall in chosenStalls" :key="stall.id">
              <ShellIcon name="pin" :size="18" />
              <span class="add-deal__stall-text"><strong>{{ stall.name }}</strong><span>{{ stall.address }}</span></span>
              <button type="button" class="lb-btn add-deal__remove" :aria-label="`Remove ${stall.name}`" @click="removeStall(stall)">Remove</button>
            </li>
          </ul>
          <!-- Always in the page so the message is announced when it appears. -->
          <p id="error-stalls" class="add-deal__error" aria-live="polite">{{ errors.stalls }}</p>
        </section>

        <!-- 3. Validity -->
        <section v-show="step === 2" class="add-deal__card" data-step="2" aria-labelledby="add-deal-step-2">
          <h2 id="add-deal-step-2" :ref="(el) => { if (el) stepHeadings[2] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon :name="STEP_ICONS[2] ?? 'calendar'" :size="20" /></span>Validity
          </h2>
          <div class="add-deal__pair">
            <div class="add-deal__field">
              <label for="deal-start" class="form-label">Start date <span class="add-deal__required" aria-hidden="true">*</span></label>
              <input
                id="deal-start"
                v-model="form.startDate"
                name="startDate"
                type="date"
                class="form-control"
                :class="{ 'is-invalid': errors.startDate }"
                v-bind="invalidAttrs('startDate')"
              />
              <div id="error-startDate" class="invalid-feedback">{{ errors.startDate }}</div>
            </div>
            <div class="add-deal__field">
              <label for="deal-end" class="form-label">Last day <span class="add-deal__required" aria-hidden="true">*</span></label>
              <input
                id="deal-end"
                v-model="form.endDate"
                name="endDate"
                type="date"
                class="form-control"
                :class="{ 'is-invalid': errors.endDate }"
                v-bind="invalidAttrs('endDate')"
              />
              <div id="error-endDate" class="invalid-feedback">{{ errors.endDate }}</div>
            </div>
          </div>
          <div class="add-deal__field">
            <label for="deal-terms" class="form-label">Terms &amp; conditions <span class="add-deal__required" aria-hidden="true">*</span></label>
            <textarea
              id="deal-terms"
              v-model="form.terms"
              name="terms"
              autocomplete="off"
              class="form-control"
              :class="{ 'is-invalid': errors.terms }"
              v-bind="invalidAttrs('terms')"
              rows="4"
              maxlength="1000"
              placeholder="One condition per line, e.g. Dine-in only…"
            ></textarea>
            <div id="error-terms" class="invalid-feedback">{{ errors.terms }}</div>
          </div>
        </section>

        <!-- 4. Review -->
        <section v-show="step === 3" class="add-deal__card" data-step="3" aria-labelledby="add-deal-step-3">
          <h2 id="add-deal-step-3" :ref="(el) => { if (el) stepHeadings[3] = el as HTMLElement }" class="add-deal__step-title" tabindex="-1">
            <span class="add-deal__step-icon" aria-hidden="true"><ShellIcon :name="STEP_ICONS[3] ?? 'check'" :size="20" /></span>Review
          </h2>
          <p class="add-deal__hint">Check everything looks right, then submit.</p>
          <div class="add-deal__review">
            <img v-if="photoPreview" :src="photoPreview" alt="Your chosen deal" width="480" height="320" class="add-deal__preview add-deal__review-photo" />
            <div class="add-deal__review-groups">
              <div v-for="group in review" :key="group.step" class="add-deal__review-group">
                <dl>
                  <div v-for="[term, value] in group.rows" :key="term">
                    <dt>{{ term }}</dt>
                    <dd>{{ value || '—' }}</dd>
                  </div>
                </dl>
                <button type="button" class="add-deal__edit" :data-testid="`review-edit-${group.step}`" @click="go(group.step)">
                  Edit<span class="visually-hidden"> {{ ADD_DEAL_STEPS[group.step]?.label }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <AddDealTip v-bind="TIPS[step] ?? TIPS[0]" />

        <div class="add-deal__nav">
          <button type="button" class="lb-btn" data-testid="add-deal-back" @click="back">
            <ShellIcon name="back" :size="18" />Back
          </button>
          <button v-if="step < LAST_STEP" type="submit" class="lb-btn lb-btn--primary" data-testid="add-deal-next">
            Next: {{ nextLabel }}<ShellIcon name="arrowRight" :size="18" />
          </button>
          <button v-else type="submit" class="lb-btn lb-btn--primary submit-button" :disabled="submitting">
            {{ submitting ? 'Submitting…' : 'Submit deal' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.add-deal {
  box-sizing: border-box;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: clamp(16px, 4vw, 32px) clamp(16px, 4vw, 24px) 48px;
}

/* ----- Header ----- */
.add-deal__hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.add-deal__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--hit, 44px);
  margin-bottom: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  font: 700 0.875rem / 1 var(--font-sans);
  color: var(--ink-muted);
  cursor: pointer;
}
.add-deal__back:hover {
  color: var(--ink);
}
.add-deal__title {
  margin: 0 0 8px;
  font-size: clamp(2rem, 6vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.add-deal__intro {
  flex: 1;
  min-width: 0;
}
.add-deal__lede {
  margin: 0;
  color: var(--ink-muted);
  font-size: 1rem;
}

/* ----- Panel ----- */
.add-deal__panel {
  display: grid;
  gap: 24px;
  padding: clamp(20px, 4vw, 36px);
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 28px;
  box-shadow: 0 2px 8px rgb(27 27 31 / 0.05);
}
.add-deal__alert {
  margin: 0;
  padding: 12px 16px;
  color: var(--coral-deep);
  font-weight: 600;
  background: var(--coral-soft);
  border-radius: 14px;
}
.add-deal__form {
  display: grid;
  gap: 24px;
}
.add-deal__card {
  display: grid;
  gap: 18px;
  padding: clamp(18px, 4vw, 28px);
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 24px;
}
.add-deal__step-title {
  display: inline-flex;
  justify-self: start;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 6px 18px 6px 6px;
  font-size: 1.125rem;
  font-weight: 750;
  background: var(--sunny-wash);
  border-radius: 999px;
}
.add-deal__step-title:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}
.add-deal__step-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--on-accent);
  background: var(--sunny);
  border-radius: 50%;
}

/* ----- Fields ----- */
.add-deal__field {
  display: grid;
  gap: 2px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.add-deal__field .form-label,
.add-deal__field legend {
  margin-bottom: 6px;
  font-weight: 700;
}
.add-deal__required {
  color: var(--coral-deep);
}
.add-deal__hint {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.875rem;
}
.add-deal__pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.add-deal__short {
  max-width: 260px;
}
.add-deal__counted {
  position: relative;
}
.add-deal__counted textarea {
  padding-bottom: 28px;
}
.add-deal__count {
  position: absolute;
  right: 14px;
  bottom: 8px;
  color: var(--ink-muted);
  font-size: 0.8125rem;
  pointer-events: none;
}
.add-deal__error {
  min-height: 0;
  margin: 4px 0 0;
  color: var(--coral-deep);
  font-size: 0.875rem;
}
.add-deal__error:empty {
  margin: 0;
}

/* Offer type: four chips that work as radio buttons. */
.add-deal__offers {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.add-deal__offer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 56px;
  padding: 8px 12px;
  font-weight: 700;
  text-align: center;
  background: var(--paper-white);
  border: 1.5px solid var(--hairline-strong, var(--hairline));
  border-radius: 16px;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}
.add-deal__offer.is-chosen {
  background: var(--sunny-wash);
  border-color: var(--sunny-deep);
  box-shadow: 0 0 0 3px var(--sunny-soft);
}
.is-invalid-group .add-deal__offer {
  border-color: var(--coral-deep);
}
.add-deal__offer-input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.add-deal__offer:has(.add-deal__offer-input:focus-visible) {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .add-deal__offer:hover {
    background: var(--paper-hover);
  }
  .add-deal__offer.is-chosen:hover {
    background: var(--sunny-wash);
  }
}

.add-deal__preview {
  max-width: 100%;
  height: auto;
  max-height: 240px;
  margin-top: 12px;
  border-radius: 14px;
  object-fit: cover;
}

/* ----- Location ----- */
.add-deal__search {
  display: flex;
  gap: 10px;
}
.add-deal__search .form-control {
  flex: 1;
  min-width: 0;
}
.add-deal__search .lb-btn {
  flex: none;
  gap: 6px;
}
.add-deal__stalls {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.add-deal__stalls li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--hairline);
  border-radius: 16px;
}
.add-deal__stalls--chosen li {
  background: var(--sunny-wash);
  border-color: transparent;
}
/* Long stall names and addresses wrap instead of pushing the button off a phone. */
.add-deal__stall-text {
  display: grid;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.add-deal__stall-text span {
  color: var(--ink-muted);
  font-size: 0.875rem;
}
.add-deal__remove {
  color: var(--coral-deep);
}
.add-deal__missing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.add-deal__missing .lb-btn {
  gap: 6px;
}

/* ----- Review ----- */
.add-deal__review {
  display: grid;
  grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.add-deal__review:not(:has(.add-deal__review-photo)) {
  grid-template-columns: minmax(0, 1fr);
}
.add-deal__review-photo {
  width: 100%;
  max-height: 260px;
  margin: 0;
  object-fit: contain;
  background: var(--paper-sunk);
}
.add-deal__review-groups {
  display: grid;
  gap: 12px;
}
.add-deal__review-group {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--paper-sunk);
  border-radius: 16px;
}
.add-deal__review-group dl {
  display: grid;
  flex: 1;
  gap: 8px;
  min-width: 0;
  margin: 0;
}
.add-deal__review-group dl > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px;
}
.add-deal__review-group dt {
  color: var(--ink-muted);
  font-weight: 600;
}
.add-deal__review-group dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.add-deal__edit {
  flex: none;
  min-height: 44px;
  padding: 0 4px;
  color: var(--ink);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
  border: 0;
  cursor: pointer;
}

/* ----- Step buttons ----- */
.add-deal__nav {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.add-deal__nav .lb-btn {
  gap: 8px;
  touch-action: manipulation;
}

@media (max-width: 640px) {
  .add-deal__pair,
  .add-deal__review {
    grid-template-columns: minmax(0, 1fr);
  }
  .add-deal__offers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .add-deal__review-group dl > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}

/* A full-width Next is easier to hit with a thumb on a phone. */
@media (max-width: 480px) {
  .add-deal__nav .lb-btn--primary {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .add-deal__offer {
    transition: none;
  }
}
</style>
