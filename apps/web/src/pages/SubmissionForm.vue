<script setup lang="ts">
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import { BModal } from '@broke-oclock/ui'
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromLabels, withLeading } from '@web/components/select-options'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { useUnsavedChanges } from '@web/lib/use-unsaved-changes'
import {
  errorMessageFor,
  MAX_PHOTO_BYTES,
  type NewDeal,
  type OfferType,
  PHOTO_TYPES,
  type Stall,
  searchStalls,
  submitDeal,
} from '@web/modules/add-deal/add-deal-api'
import { computed, nextTick, ref } from 'vue'

// ----- Dropdown choices -----
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
const offerLabels: Record<OfferType, string> = {
  BUY_ONE_GET_ONE: '1-for-1',
  PERCENT_OFF: '% off',
  FIXED_PRICE: 'Fixed price',
  OTHER: 'Other',
}

// ----- Form -----
// Price is typed in dollars here and turned into cents when submitting.
const emptyForm = () => ({
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
const categoryOptions = withLeading({ value: '', label: 'Choose a category' }, optionsFromLabels(categoryLabels))
const cuisineOptions = withLeading({ value: '', label: 'Choose a cuisine' }, optionsFromLabels(cuisineLabels))
const offerOptions = withLeading({ value: '', label: 'Choose an offer type' }, optionsFromLabels(offerLabels))
const form = ref(emptyForm())
const photo = ref<File | null>(null)
const photoPreview = ref('') // a temporary link to the chosen image, for the <img> preview
const chosenStalls = ref<Stall[]>([])

// One message per field, e.g. errors.title = 'Please give the deal a title.'
const errors = ref<Record<string, string>>({})
const submitting = ref(false)
const errorMessage = ref('') // shown on the page when fields need fixing
const formEl = ref<HTMLFormElement | null>(null)

// Links a field to its error text so screen readers read the message with the field.
const invalidAttrs = (field: string) =>
  errors.value[field]
    ? { 'aria-invalid': 'true' as const, 'aria-describedby': `error-${field}` }
    : {}

// Anything typed, chosen or uploaded counts as unsaved work worth a warning before leaving.
const isDirty = computed(
  () =>
    JSON.stringify(form.value) !== JSON.stringify(emptyForm()) ||
    chosenStalls.value.length > 0 ||
    photo.value !== null,
)
useUnsavedChanges(isDirty)

// ----- Pop-up -----
// The pop-up (a Bootstrap modal) opens when showPopup is true, after a submit succeeds or fails.
const showPopup = ref(false)
const popupTitle = ref('')
const popupMessage = ref('')

const openPopup = (title: string, message: string) => {
  popupTitle.value = title
  popupMessage.value = message
  showPopup.value = true
}

// Today's date as 'YYYY-MM-DD' in the user's own time zone, to compare with the date boxes.
const today = new Date().toLocaleDateString('en-CA')

// ----- Stall search -----
const stallSearch = ref('')
const stallResults = ref<Stall[]>([])
const searching = ref(false)
const searchMessage = ref('')

const findStalls = async () => {
  if (searching.value) return // Enter pressed again while a search is still running
  searching.value = true
  searchMessage.value = ''
  try {
    stallResults.value = await searchStalls(stallSearch.value)
    if (stallResults.value.length === 0) searchMessage.value = 'No stalls found. Try other words.'
  } catch (error) {
    searchMessage.value = errorMessageFor(error, 'Could not search stalls. Please try again.')
  } finally {
    searching.value = false
  }
}

const isChosen = (stall: Stall) => chosenStalls.value.some((chosen) => chosen.id === stall.id)

const addStall = (stall: Stall) => {
  if (!isChosen(stall)) chosenStalls.value.push(stall)
}

const removeStall = (stall: Stall) => {
  chosenStalls.value = chosenStalls.value.filter((chosen) => chosen.id !== stall.id)
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

// ----- Checking the form -----
// Fills errors with a message for every field that has a problem.
// Returns true when there are no problems.
const checkForm = () => {
  const f = form.value
  const found: Record<string, string> = {}

  if (f.title.trim() === '') found.title = 'Please give the deal a title.'
  if (f.description.trim() === '') found.description = 'Please describe the deal.'
  if (f.category === '') found.category = 'Please choose a category.'
  if (f.cuisine === '') found.cuisine = 'Please choose a cuisine, or "No specific cuisine".'
  if (f.offerType === '') found.offerType = 'Please choose the type of offer.'
  if (f.offerType === 'PERCENT_OFF') {
    if (f.discountPercent === '' || f.discountPercent < 1 || f.discountPercent > 100) {
      found.discountPercent = 'The discount must be between 1 and 100 percent.'
    }
  }
  if (f.offerType === 'FIXED_PRICE') {
    if (f.priceDollars === '' || f.priceDollars <= 0) found.priceDollars = 'Please enter the price.'
  }
  if (chosenStalls.value.length === 0) found.stalls = 'Please add at least one stall.'
  if (f.startDate === '') found.startDate = 'Please choose a start date.'
  if (f.endDate === '') found.endDate = 'Please choose the last day.'
  else if (f.endDate < today) found.endDate = 'The last day cannot be in the past.'
  else if (f.startDate && f.endDate < f.startDate) {
    found.endDate = 'The last day cannot be before the start date.'
  }
  if (f.terms.trim() === '') found.terms = 'Please add the terms & conditions.'
  if (photo.value === null) found.photo = 'Please add a photo of the deal.'

  errors.value = found
  return Object.keys(found).length === 0
}

// ----- Submitting -----
const sendDeal = async () => {
  errorMessage.value = ''
  if (!checkForm()) {
    errorMessage.value = 'Please fix the highlighted fields.'
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }

  const f = form.value
  const deal: NewDeal = {
    title: f.title.trim(),
    description: f.description.trim(),
    category: f.category,
    cuisine: f.cuisine === 'NONE' ? null : f.cuisine,
    offerType: f.offerType as OfferType,
    discountPercent: f.offerType === 'PERCENT_OFF' ? Number(f.discountPercent) : null,
    priceCents: f.offerType === 'FIXED_PRICE' ? Math.round(Number(f.priceDollars) * 100) : null,
    stallIds: chosenStalls.value.map((stall) => stall.id),
    startDate: f.startDate,
    endDate: f.endDate,
    terms: f.terms.trim(),
  }

  submitting.value = true
  try {
    await submitDeal(deal, photo.value as File)
    openPopup('Deal submitted', 'Thanks! Your deal will appear once an admin reviews it.')
    clearForm()
  } catch (error) {
    openPopup(
      'Could not submit',
      errorMessageFor(error, 'Could not submit the deal. Please try again.'),
    )
  } finally {
    submitting.value = false
  }
}

// Empties every field so the user can add another deal.
const photoInput = ref<HTMLInputElement | null>(null)
const clearForm = () => {
  form.value = emptyForm()
  chosenStalls.value = []
  stallResults.value = []
  stallSearch.value = ''
  photo.value = null
  photoPreview.value = ''
  if (photoInput.value) photoInput.value.value = ''
  errors.value = {}
}
</script>

<template>
  <section class="container py-4 submit-deal">
    <h1 class="h2 mb-2">Add a deal</h1>
    <p class="text-secondary">
      Found a food deal? Share it here. An admin checks every deal before it appears on the map.
    </p>

    <p v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</p>

    <!-- Pop-up after submitting. v-model opens/closes it; OK closes it. -->
    <BModal v-model="showPopup" :title="popupTitle" centered ok-only ok-title="OK">
      <p class="mb-0">{{ popupMessage }}</p>
    </BModal>

    <form ref="formEl" class="card card-body" novalidate @submit.prevent="sendDeal">
      <!-- The deal -->
      <h2 class="h5 mb-3">The deal</h2>

      <label for="deal-title" class="form-label">Title</label>
      <input
        id="deal-title"
        v-model="form.title"
        name="title"
        autocomplete="off"
        class="form-control"
        :class="{ 'is-invalid': errors.title }"
        v-bind="invalidAttrs('title')"
        maxlength="120"
        placeholder="e.g. 1-for-1 chicken rice…"
      />
      <div id="error-title" class="invalid-feedback">{{ errors.title }}</div>

      <label for="deal-description" class="form-label mt-3">Description</label>
      <textarea
        id="deal-description"
        v-model="form.description"
        name="description"
        autocomplete="off"
        class="form-control"
        :class="{ 'is-invalid': errors.description }"
        v-bind="invalidAttrs('description')"
        rows="3"
        maxlength="1000"
      ></textarea>
      <div id="error-description" class="invalid-feedback">{{ errors.description }}</div>

      <div class="row g-3 mt-0">
        <div class="col-sm-6">
          <label for="deal-category" class="form-label">Category</label>
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
        <div class="col-sm-6">
          <label for="deal-cuisine" class="form-label">Cuisine</label>
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

      <!-- The offer -->
      <h2 class="h5 mt-4 mb-3">The offer</h2>
      <div class="row g-3">
        <div class="col-sm-6">
          <label for="deal-offer" class="form-label">Offer type</label>
          <AppSelect
            id="deal-offer"
            :model-value="form.offerType"
            name="offerType"
            class="form-select"
            :class="{ 'is-invalid': errors.offerType }"
            v-bind="invalidAttrs('offerType')"
            :options="offerOptions"
            @update:model-value="form.offerType = $event as OfferType | ''"
          />
          <div id="error-offerType" class="invalid-feedback">{{ errors.offerType }}</div>
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
            :class="{ 'is-invalid': errors.discountPercent }"
            v-bind="invalidAttrs('discountPercent')"
          />
          <div id="error-discountPercent" class="invalid-feedback">
            {{ errors.discountPercent }}
          </div>
        </div>
        <div v-if="form.offerType === 'FIXED_PRICE'" class="col-sm-6">
          <label for="deal-price" class="form-label">Deal price ($)</label>
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
      </div>

      <!-- Where -->
      <h2 class="h5 mt-4 mb-3">Where is it?</h2>
      <label for="stall-search" class="form-label">Find the stall</label>
      <div class="input-group">
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
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="searching"
          @click="findStalls"
        >
          {{ searching ? 'Searching…' : 'Search' }}
        </button>
      </div>
      <div role="status">
        <p v-if="searchMessage" class="small text-secondary mt-2 mb-0">{{ searchMessage }}</p>
      </div>

      <!-- Search results: click Add to put a stall on the deal -->
      <ul v-if="stallResults.length > 0" class="list-group mt-2">
        <li
          v-for="stall in stallResults"
          :key="stall.id"
          class="list-group-item d-flex justify-content-between align-items-center gap-2"
        >
          <span class="stall-text">
            {{ stall.name }}
            <span class="small text-secondary d-block">{{ stall.address }}</span>
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary flex-shrink-0"
            :disabled="isChosen(stall)"
            @click="addStall(stall)"
          >
            {{ isChosen(stall) ? 'Added' : 'Add' }}
          </button>
        </li>
      </ul>

      <!-- The stalls already added to this deal -->
      <p class="form-label mt-3 mb-2">Stalls with this deal</p>
      <p v-if="chosenStalls.length === 0" class="small text-secondary mb-0">
        No stalls added yet. Search above and click Add. A deal can be at more than one stall.
      </p>
      <ul v-else class="list-group">
        <li
          v-for="stall in chosenStalls"
          :key="stall.id"
          class="list-group-item d-flex justify-content-between align-items-center gap-2"
        >
          <span class="stall-text">
            {{ stall.name }}
            <span class="small text-secondary d-block">{{ stall.address }}</span>
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-danger flex-shrink-0"
            :aria-label="`Remove ${stall.name}`"
            @click="removeStall(stall)"
          >
            Remove
          </button>
        </li>
      </ul>
      <!-- Always in the page so the message is announced when it appears. -->
      <p id="error-stalls" class="small text-danger mt-1 mb-0" aria-live="polite">
        {{ errors.stalls }}
      </p>

      <!-- When -->
      <h2 class="h5 mt-4 mb-3">When?</h2>
      <div class="row g-3">
        <div class="col-sm-6">
          <label for="deal-start" class="form-label">Start date</label>
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
        <div class="col-sm-6">
          <label for="deal-end" class="form-label">Last day</label>
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

      <label for="deal-terms" class="form-label mt-3">Terms &amp; conditions</label>
      <textarea
        id="deal-terms"
        v-model="form.terms"
        name="terms"
        autocomplete="off"
        class="form-control"
        :class="{ 'is-invalid': errors.terms }"
        v-bind="invalidAttrs('terms')"
        rows="3"
        maxlength="1000"
        placeholder="One condition per line, e.g. Dine-in only…"
      ></textarea>
      <div id="error-terms" class="invalid-feedback">{{ errors.terms }}</div>

      <!-- Photo -->
      <h2 class="h5 mt-4 mb-3">Photo</h2>
      <label for="deal-photo" class="form-label">
        Photo of the deal (JPEG, PNG or WebP, up to 4 MB)
      </label>
      <input
        id="deal-photo"
        ref="photoInput"
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="form-control"
        :class="{ 'is-invalid': errors.photo }"
        v-bind="invalidAttrs('photo')"
        @change="choosePhoto"
      />
      <div id="error-photo" class="invalid-feedback">{{ errors.photo }}</div>
      <img
        v-if="photoPreview"
        :src="photoPreview"
        alt="Your chosen deal"
        width="480"
        height="320"
        class="photo-preview mt-3"
      />

      <button type="submit" class="btn btn-primary align-self-start mt-4 submit-button" :disabled="submitting">
        {{ submitting ? 'Submitting…' : 'Submit deal' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
/* Keep the form a comfortable reading width on wide screens. */
.submit-deal {
  max-width: 720px;
}

/* Long stall names and addresses wrap instead of pushing the Add/Remove button off a phone. */
.stall-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.photo-preview {
  max-width: 100%;
  height: auto;
  max-height: 240px;
  border-radius: 8px;
  object-fit: cover;
}

.submit-button {
  touch-action: manipulation;
}

/* A full-width submit is easier to hit with a thumb on a phone. */
@media (max-width: 480px) {
  .submit-button {
    width: 100%;
  }
}
</style>
