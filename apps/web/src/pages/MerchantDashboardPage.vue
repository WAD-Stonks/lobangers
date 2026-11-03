<script setup lang="ts">
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import ConfirmDialog from '@web/components/ConfirmDialog.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { formatDate, formatMoneyMinor } from '@web/lib/format'
import { useConfirm } from '@web/lib/use-confirm'
import { useUnsavedChanges } from '@web/lib/use-unsaved-changes'
import FlashDealFields from '@web/modules/merchant/FlashDealFields.vue'
import FlashDropsSection from '@web/modules/merchant/FlashDropsSection.vue'
import {
  type MerchantFlashDropBody as FlashBody,
  flashDropErrorMessage,
  type MerchantFlashDrop,
  saveFlashDraft,
} from '@web/modules/merchant/flash-drop-api'
import {
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
const flashFieldsEl = ref<HTMLElement | null>(null)
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
const photoInput = ref<HTMLInputElement | null>(null)
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
  if (photoInput.value) photoInput.value.value = '' // clear the file box
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

const openCreateForm = () => {
  if (!confirmDiscard()) return
  clearNewPhoto()
  resetFlash()
  form.value = emptyForm()
  // A merchant with only one outlet will almost always pick it, so tick it for them.
  if (outlets.value.length === 1) form.value.outletIds = outlets.value.map((outlet) => outlet.id)
  editingId.value = null
  copiedFrom.value = null
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
const openRunAgainForm = (deal: MerchantDeal) => {
  if (!confirmDiscard()) return
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
  formError.value = ''
  fieldErrors.value = {}
  successMessage.value = ''
  openedAs.value = snapshot()
  showForm.value = true
  // The ended deals are at the bottom of the page and the form at the top.
  nextTick(() => formEl.value?.scrollIntoView?.({ block: 'start' }))
}

const openEditForm = (deal: MerchantDeal) => {
  if (!confirmDiscard()) return
  clearNewPhoto()
  resetFlash()
  form.value = formFrom(deal)
  editingId.value = deal.id
  copiedFrom.value = null
  formError.value = ''
  fieldErrors.value = {}
  successMessage.value = ''
  openedAs.value = snapshot()
  showForm.value = true
}

// Edit on a flash deal draft opens it in this form with its flash fields.
const openFlashDraftForm = (drop: MerchantFlashDrop) => {
  if (!confirmDiscard()) return
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
  flashProblem.value = null
  formError.value = ''
  fieldErrors.value = {}
  successMessage.value = ''
  openedAs.value = snapshot()
  showForm.value = true
  // The Flash deals section is below the deals and the form at the top.
  nextTick(() => formEl.value?.scrollIntoView?.({ block: 'start' }))
}

// The first press of "Save as flash deal" shows the flash fields; the next one saves.
const showFlashFields = async () => {
  flashMode.value = true
  // A flash deal runs at one outlet; keep the first one ticked.
  form.value.outletIds = form.value.outletIds.slice(0, 1)
  await nextTick()
  flashFieldsEl.value?.scrollIntoView?.({ block: 'start' })
  document.getElementById('flash-price')?.focus({ preventScroll: true })
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
const cancelForm = () => {
  if (confirmDiscard()) closeForm()
}

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
  fieldErrors.value = checkForm()
  if (Object.keys(fieldErrors.value).length > 0) {
    formError.value = 'Please fix the highlighted fields.'
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }

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
  fieldErrors.value = checkForm()
  const f = form.value
  const offer = flashOffer.value
  flashProblem.value = flashFieldsProblem(
    flashFields.value,
    { offerType: offer.offerType, priceCents: offer.flashPriceCents },
    new Date(),
  )
  if (Object.keys(fieldErrors.value).length > 0 || flashProblem.value) {
    formError.value = 'Please fix the highlighted fields.'
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }

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

const submitForm = () => (flashMode.value ? saveFlash() : saveDeal())

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
    <ConfirmDialog />
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

      <!-- Create / edit form -->
      <form
        v-if="showForm"
        ref="formEl"
        class="card card-body mb-4 deal-form"
        novalidate
        @submit.prevent="submitForm"
      >
        <h2 class="h4 mb-3">{{ formTitle }}</h2>
        <p v-if="copiedFrom" class="small text-secondary">
          Copied from "{{ copiedFrom }}". Check the dates and outlets, and add a photo if you want
          one, before saving.
        </p>

        <div class="mb-3">
        <label for="deal-title" class="form-label">Title</label>
        <input
          id="deal-title"
          v-model="form.title"
          name="title"
          autocomplete="off"
          class="form-control"
          :class="{ 'is-invalid': fieldErrors.title }"
          v-bind="invalidAttrs('title')"
          maxlength="120"
        />
        <div id="error-title" class="invalid-feedback">{{ fieldErrors.title }}</div>
        </div>

        <div class="mb-3">
        <label for="deal-description" class="form-label">Description</label>
        <textarea
          id="deal-description"
          v-model="form.description"
          name="description"
          autocomplete="off"
          class="form-control"
          :class="{ 'is-invalid': fieldErrors.description }"
          v-bind="invalidAttrs('description')"
          rows="3"
          maxlength="1000"
        ></textarea>
        <div id="error-description" class="invalid-feedback">{{ fieldErrors.description }}</div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="deal-category" class="form-label">Category</label>
            <select
              id="deal-category"
              v-model="form.category"
              name="category"
              class="form-select"
              :class="{ 'is-invalid': fieldErrors.category }"
              v-bind="invalidAttrs('category')"
            >
              <option value="">Choose a category</option>
              <option v-for="(label, value) in categoryLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
            <div id="error-category" class="invalid-feedback">{{ fieldErrors.category }}</div>
          </div>
          <div class="col-sm-6">
            <label for="deal-cuisine" class="form-label">Cuisine</label>
            <select
              id="deal-cuisine"
              v-model="form.cuisine"
              name="cuisine"
              class="form-select"
              :class="{ 'is-invalid': fieldErrors.cuisine }"
              v-bind="invalidAttrs('cuisine')"
            >
              <option value="">Choose a cuisine</option>
              <option v-for="(label, value) in cuisineLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
            <div id="error-cuisine" class="invalid-feedback">{{ fieldErrors.cuisine }}</div>
          </div>
        </div>

        <fieldset
          class="mb-3"
          :aria-invalid="fieldErrors.outletIds ? 'true' : undefined"
          :aria-describedby="fieldErrors.outletIds ? 'error-outletIds' : undefined"
        >
          <legend class="form-label fs-6">
            {{ flashMode ? 'Which outlet is this flash deal at? (one only)' : 'Which outlets is this deal at?' }}
          </legend>
          <div v-for="outlet in outlets" :key="outlet.id" class="form-check">
            <input
              :id="`outlet-${outlet.id}`"
              v-model="form.outletIds"
              name="outletIds"
              :value="outlet.id"
              type="checkbox"
              class="form-check-input"
              :class="{ 'is-invalid': fieldErrors.outletIds }"
            />
            <label :for="`outlet-${outlet.id}`" class="form-check-label text-break">
              {{ outlet.name }} <span class="text-secondary small">({{ outlet.address }})</span>
            </label>
          </div>
          <div id="error-outletIds" class="invalid-feedback" :class="{ 'd-block': fieldErrors.outletIds }">
            {{ fieldErrors.outletIds }}
          </div>
        </fieldset>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="deal-offer" class="form-label">{{ flashMode ? 'Flash offer' : 'Offer type' }}</label>
            <select id="deal-offer" v-model="form.offerType" name="offerType" class="form-select">
              <option v-for="(label, value) in offerLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>
          <!-- Only show the box the chosen offer type needs -->
          <div v-if="form.offerType === 'PERCENT_OFF'" class="col-sm-6">
            <label for="deal-discount" class="form-label">Discount (%)</label>
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
            <div id="error-discountPercent" class="invalid-feedback">
              {{ fieldErrors.discountPercent }}
            </div>
          </div>
          <div v-if="form.offerType === 'FIXED_PRICE'" class="col-sm-6">
            <label for="deal-price" class="form-label">{{ flashMode ? 'Flash price ($)' : 'Deal price ($)' }}</label>
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
            <div id="error-priceDollars" class="invalid-feedback">
              {{ fieldErrors.priceDollars }}
            </div>
          </div>
        </div>

        <!-- A flash deal has its own start time and length instead of dates. -->
        <div v-if="!flashMode" class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="deal-start" class="form-label">Start date (optional)</label>
            <input
              id="deal-start"
              v-model="form.startDate"
              name="startDate"
              type="date"
              class="form-control"
            />
          </div>
          <div class="col-sm-6">
            <label for="deal-end" class="form-label">Last day (optional)</label>
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

        <label for="deal-terms" class="form-label">Terms &amp; conditions (optional)</label>
        <textarea
          id="deal-terms"
          v-model="form.terms"
          name="terms"
          autocomplete="off"
          class="form-control mb-3"
          rows="3"
          maxlength="1000"
          placeholder="One condition per line, e.g. Dine-in only…"
        ></textarea>

        <div class="mb-3">
          <label for="deal-photo" class="form-label">
            {{ shownPhoto ? 'Replace the photo' : 'Photo' }} (optional: JPEG, PNG or WebP, up to
            4 MB)
          </label>
          <input
            id="deal-photo"
            ref="photoInput"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="form-control"
            :class="{ 'is-invalid': fieldErrors.photo }"
            v-bind="invalidAttrs('photo')"
            @change="choosePhoto"
          />
          <div id="error-photo" class="invalid-feedback">{{ fieldErrors.photo }}</div>
          <div v-if="shownPhoto" class="d-flex flex-wrap align-items-end gap-2 mt-3">
            <img
              :src="shownPhoto"
              alt="Your deal, as customers will see it"
              width="480"
              height="320"
              class="photo-preview"
            />
            <button type="button" class="btn btn-sm btn-outline-danger" @click="removePhoto">
              Remove photo
            </button>
          </div>
        </div>

        <div v-if="flashMode" ref="flashFieldsEl" class="flash-holder">
          <FlashDealFields
            v-model="flashFields"
            :title="form.title"
            :offer="flashOffer"
            :problem="flashProblem"
          />
        </div>

        <!-- Always mounted so the summary or a save error is announced. -->
        <div role="alert">
          <p v-if="formError" class="text-danger">{{ formError }}</p>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <!-- An ordinary deal goes live when saved; a flash deal is saved as a draft. -->
          <template v-if="!flashMode">
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving…' : 'Save deal' }}
            </button>
            <button
              v-if="editingId === null"
              type="button"
              class="btn btn-dark"
              :disabled="saving"
              @click="showFlashFields"
            >
              Save as flash deal
            </button>
          </template>
          <template v-else>
            <button type="submit" class="btn btn-dark" :disabled="saving">
              {{ saving ? 'Saving…' : editingFlash ? 'Save draft' : 'Save as flash deal' }}
            </button>
            <button
              v-if="editingFlash === null"
              type="button"
              class="btn btn-outline-primary"
              :disabled="saving"
              @click="backToNormalDeal"
            >
              Make it an ordinary deal
            </button>
          </template>
          <button type="button" class="btn btn-outline-secondary" @click="cancelForm">Cancel</button>
        </div>
      </form>

      <!-- Current deals (live and scheduled) -->
      <h2 class="h4 mb-3">Current deals</h2>
      <p v-if="currentDeals.length === 0" class="text-secondary">No current deals.</p>
      <ul v-else class="list-unstyled d-grid gap-3 mb-4">
        <li v-for="deal in currentDeals" :key="deal.id" class="card card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1 deal-heading">
              <h3 class="h5 mb-0">{{ deal.title }}</h3>
            </div>
            <span
              class="badge flex-shrink-0"
              :class="statusOf(deal) === 'Live' ? 'text-bg-success' : 'text-bg-info'"
            >
              {{ statusOf(deal) }}
            </span>
          </div>
          <img
            v-if="deal.photo"
            :src="deal.photo.url"
            :alt="deal.title"
            width="480"
            height="320"
            class="photo-preview mb-2"
          />
          <p class="mb-2 text-break">{{ deal.description }}</p>
          <p class="small text-secondary mb-1">
            <strong>{{ offerText(deal) }}</strong> · {{ datesText(deal) }}
          </p>
          <p class="small text-secondary mb-1">At: {{ outletNames(deal) }}</p>
          <p v-if="deal.terms" class="small text-secondary mb-2 terms">Terms: {{ deal.terms }}</p>
          <div class="d-flex flex-wrap gap-2 mt-2">
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
          </div>
        </li>
      </ul>

      <!-- Flash deals: drafts, live and past. Drafts are edited in the form above. -->
      <FlashDropsSection ref="flashDrops" @edit="openFlashDraftForm" />

      <!-- Ended deals: view only -->
      <h2 class="h4 mb-3">Ended deals</h2>
      <p v-if="endedDeals.length === 0" class="text-secondary">No ended deals.</p>
      <ul v-else class="list-unstyled d-grid gap-3">
        <li v-for="deal in endedDeals" :key="deal.id" class="card card-body bg-body-tertiary">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1 deal-heading">
              <h3 class="h5 mb-0">{{ deal.title }}</h3>
            </div>
            <span class="badge text-bg-secondary flex-shrink-0">Ended</span>
          </div>
          <p class="small text-secondary mb-1">
            <strong>{{ offerText(deal) }}</strong> · {{ datesText(deal) }}
          </p>
          <p class="small text-secondary mb-0">At: {{ outletNames(deal) }}</p>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <button type="button" class="btn btn-sm btn-outline-primary" @click="openRunAgainForm(deal)">
              Run it again<span class="visually-hidden">: {{ deal.title }}</span>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" @click="confirmDeleteDeal(deal)">
              Delete<span class="visually-hidden">: {{ deal.title }}</span>
            </button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
/* A readable width on very wide screens; the deal cards stay a comfortable line length. */
.merchant-dashboard {
  max-width: 64rem;
}

/* Long deal titles wrap beside the status badge instead of pushing it off a 320px phone. */
.deal-heading {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Leave room above the flash fields when they are scrolled into view. */
.flash-holder {
  scroll-margin-top: 80px;
}

.photo-preview {
  max-width: 100%;
  height: auto;
  max-height: 240px;
  border-radius: 8px;
  object-fit: cover;
}

/* Keep the line breaks the merchant typed in the terms box. */
.terms {
  white-space: pre-line;
  overflow-wrap: anywhere;
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
