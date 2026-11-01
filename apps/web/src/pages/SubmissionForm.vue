<script setup lang="ts">
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import { BModal } from '@broke-oclock/ui'
import {
  errorMessageFor,
  MAX_PHOTO_BYTES,
  type NewDeal,
  type OfferType,
  PHOTO_TYPES,
  type Stall,
  searchStalls,
  submitDeal,
  USE_SAMPLE_DATA,
} from '@web/modules/add-deal/add-deal-api'
import { ref } from 'vue'

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
const form = ref(emptyForm())
const photo = ref<File | null>(null)
const photoPreview = ref('') // a temporary link to the chosen image, for the <img> preview
const chosenStalls = ref<Stall[]>([])

// One message per field, e.g. errors.title = 'Please give the deal a title.'
const errors = ref<Record<string, string>>({})
const submitting = ref(false)
const errorMessage = ref('') // shown on the page when fields need fixing

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

    <p v-if="USE_SAMPLE_DATA" class="alert alert-warning">
      Sample mode: the stalls are made up, and submitting shows a success message but does not
      send the deal anywhere.
    </p>
    <p v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</p>

    <!-- Pop-up after submitting. v-model opens/closes it; OK closes it. -->
    <BModal v-model="showPopup" :title="popupTitle" centered ok-only ok-title="OK">
      <p class="mb-0">{{ popupMessage }}</p>
    </BModal>

    <form class="card card-body" novalidate @submit.prevent="sendDeal">
      <!-- The deal -->
      <h2 class="h5 mb-3">The deal</h2>

      <label for="deal-title" class="form-label">Title</label>
      <input
        id="deal-title"
        v-model="form.title"
        class="form-control"
        :class="{ 'is-invalid': errors.title }"
        maxlength="120"
        placeholder="e.g. 1-for-1 chicken rice"
      />
      <div class="invalid-feedback">{{ errors.title }}</div>

      <label for="deal-description" class="form-label mt-3">Description</label>
      <textarea
        id="deal-description"
        v-model="form.description"
        class="form-control"
        :class="{ 'is-invalid': errors.description }"
        rows="3"
        maxlength="1000"
      ></textarea>
      <div class="invalid-feedback">{{ errors.description }}</div>

      <div class="row g-3 mt-0">
        <div class="col-sm-6">
          <label for="deal-category" class="form-label">Category</label>
          <select
            id="deal-category"
            v-model="form.category"
            class="form-select"
            :class="{ 'is-invalid': errors.category }"
          >
            <option value="">Choose a category</option>
            <option v-for="(label, value) in categoryLabels" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
          <div class="invalid-feedback">{{ errors.category }}</div>
        </div>
        <div class="col-sm-6">
          <label for="deal-cuisine" class="form-label">Cuisine</label>
          <select
            id="deal-cuisine"
            v-model="form.cuisine"
            class="form-select"
            :class="{ 'is-invalid': errors.cuisine }"
          >
            <option value="">Choose a cuisine</option>
            <option v-for="(label, value) in cuisineLabels" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
          <div class="invalid-feedback">{{ errors.cuisine }}</div>
        </div>
      </div>

      <!-- The offer -->
      <h2 class="h5 mt-4 mb-3">The offer</h2>
      <div class="row g-3">
        <div class="col-sm-6">
          <label for="deal-offer" class="form-label">Offer type</label>
          <select
            id="deal-offer"
            v-model="form.offerType"
            class="form-select"
            :class="{ 'is-invalid': errors.offerType }"
          >
            <option value="">Choose an offer type</option>
            <option v-for="(label, value) in offerLabels" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
          <div class="invalid-feedback">{{ errors.offerType }}</div>
        </div>
        <!-- Only show the box the chosen offer type needs -->
        <div v-if="form.offerType === 'PERCENT_OFF'" class="col-sm-6">
          <label for="deal-discount" class="form-label">Discount (%)</label>
          <input
            id="deal-discount"
            v-model.number="form.discountPercent"
            type="number"
            min="1"
            max="100"
            class="form-control"
            :class="{ 'is-invalid': errors.discountPercent }"
          />
          <div class="invalid-feedback">{{ errors.discountPercent }}</div>
        </div>
        <div v-if="form.offerType === 'FIXED_PRICE'" class="col-sm-6">
          <label for="deal-price" class="form-label">Deal price ($)</label>
          <input
            id="deal-price"
            v-model.number="form.priceDollars"
            type="number"
            min="0.01"
            step="0.01"
            class="form-control"
            :class="{ 'is-invalid': errors.priceDollars }"
          />
          <div class="invalid-feedback">{{ errors.priceDollars }}</div>
        </div>
      </div>

      <!-- Where -->
      <h2 class="h5 mt-4 mb-3">Where is it?</h2>
      <label for="stall-search" class="form-label">Find the stall</label>
      <div class="input-group">
        <input
          id="stall-search"
          v-model="stallSearch"
          class="form-control"
          maxlength="100"
          placeholder="Stall or shop name"
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
      <p v-if="searchMessage" class="small text-secondary mt-2 mb-0">{{ searchMessage }}</p>

      <!-- Search results: click Add to put a stall on the deal -->
      <ul v-if="stallResults.length > 0" class="list-group mt-2">
        <li
          v-for="stall in stallResults"
          :key="stall.id"
          class="list-group-item d-flex justify-content-between align-items-center gap-2"
        >
          <span>
            {{ stall.name }}
            <span class="small text-secondary d-block">{{ stall.address }}</span>
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
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
          <span>
            {{ stall.name }}
            <span class="small text-secondary d-block">{{ stall.address }}</span>
          </span>
          <button type="button" class="btn btn-sm btn-outline-danger" @click="removeStall(stall)">
            Remove
          </button>
        </li>
      </ul>
      <p v-if="errors.stalls" class="small text-danger mt-1 mb-0">{{ errors.stalls }}</p>

      <!-- When -->
      <h2 class="h5 mt-4 mb-3">When?</h2>
      <div class="row g-3">
        <div class="col-sm-6">
          <label for="deal-start" class="form-label">Start date</label>
          <input
            id="deal-start"
            v-model="form.startDate"
            type="date"
            class="form-control"
            :class="{ 'is-invalid': errors.startDate }"
          />
          <div class="invalid-feedback">{{ errors.startDate }}</div>
        </div>
        <div class="col-sm-6">
          <label for="deal-end" class="form-label">Last day</label>
          <input
            id="deal-end"
            v-model="form.endDate"
            type="date"
            class="form-control"
            :class="{ 'is-invalid': errors.endDate }"
          />
          <div class="invalid-feedback">{{ errors.endDate }}</div>
        </div>
      </div>

      <label for="deal-terms" class="form-label mt-3">Terms &amp; conditions</label>
      <textarea
        id="deal-terms"
        v-model="form.terms"
        class="form-control"
        :class="{ 'is-invalid': errors.terms }"
        rows="3"
        maxlength="1000"
        placeholder="One condition per line, e.g. Dine-in only"
      ></textarea>
      <div class="invalid-feedback">{{ errors.terms }}</div>

      <!-- Photo -->
      <h2 class="h5 mt-4 mb-3">Photo</h2>
      <label for="deal-photo" class="form-label">
        Photo of the deal (JPEG, PNG or WebP, up to 4 MB)
      </label>
      <input
        id="deal-photo"
        ref="photoInput"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="form-control"
        :class="{ 'is-invalid': errors.photo }"
        @change="choosePhoto"
      />
      <div class="invalid-feedback">{{ errors.photo }}</div>
      <img v-if="photoPreview" :src="photoPreview" alt="Your chosen deal" class="photo-preview mt-3" />

      <button type="submit" class="btn btn-primary align-self-start mt-4" :disabled="submitting">
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

.photo-preview {
  max-width: 100%;
  max-height: 240px;
  border-radius: 8px;
  object-fit: cover;
}
</style>

<!--
  OLD PROTOTYPE FORM, commented out for now (kept for reference).
  To bring it back: delete the new <template> above and this comment's first and last lines,
  then change every <!~~ ... ~~> below back to an HTML comment (<!- - ... - -> without the spaces).
  They were changed because an HTML comment cannot contain another HTML comment.

<script setup lang="ts">
import { ref } from 'vue'

type DealForm = {
  merchantName: string
  title: string
  description: string
  cuisine: string
  originalPrice: string | number
  promotionalPrice: string | number
  location: string
  photo: File | null
}

type FormErrors = Partial<Record<keyof DealForm, string>>

const cuisines = [
  'Chinese',
  'Japanese',
  'Korean',
  'Western',
  'Indian',
  'Thai',
  'Malay',
  'Cafe & Desserts',
  'Other',
]

const deal = ref<DealForm>({
  merchantName: '',
  title: '',
  description: '',
  cuisine: '',
  originalPrice: '',
  promotionalPrice: '',
  location: '',
  photo: null,
})

const photoPreview = ref('')
const errors = ref<FormErrors>({})
const saving = ref(false)
const message = ref('')

// Load previously saved deals safely
// Existing entries can have any JSON shape; preserve them without a new storage schema.
let savedDealsList: unknown[] = []

try {
  const storedDeals = localStorage.getItem('student_deals')

  if (storedDeals) {
    const parsedDeals: unknown = JSON.parse(storedDeals)

    if (Array.isArray(parsedDeals)) {
      savedDealsList = parsedDeals
    } else {
      localStorage.setItem('student_deals', '[]')
      message.value = 'Saved deals were invalid. Starting with an empty list.'
    }
  }
} catch {
  try {
    localStorage.setItem('student_deals', '[]')
  } catch {
    console.log('Unable to reset localStorage.')
  }

  message.value = 'Unable to load saved deals. Starting with an empty list.'
}

const savedDeals = ref<unknown[]>(savedDealsList)

// File handling
function selectPhoto(event: Event) {
  const input = event.target
  const file = input instanceof HTMLInputElement ? (input.files?.[0] ?? null) : null

  if (file === null) {
    return
  }

  if (!file.type.startsWith('image/')) {
    errors.value.photo = 'Please select an image.'
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    errors.value.photo = 'Image must be smaller than 5 MB.'
    return
  }

  deal.value.photo = file
  photoPreview.value = URL.createObjectURL(file)

  delete errors.value.photo
}

// Validate form
function validate() {
  errors.value = {}

  if (!deal.value.merchantName.trim()) {
    errors.value.merchantName = 'Enter a merchant name.'
  }

  if (!deal.value.title.trim()) {
    errors.value.title = 'Enter a deal title.'
  }

  if (!deal.value.cuisine) {
    errors.value.cuisine = 'Choose a cuisine.'
  }

  const originalPrice = Number(deal.value.originalPrice)
  const promotionalPrice = Number(deal.value.promotionalPrice)

  if (deal.value.originalPrice === '' || !Number.isFinite(originalPrice) || originalPrice <= 0) {
    errors.value.originalPrice = 'Enter a valid original price.'
  }

  if (
    deal.value.promotionalPrice === '' ||
    !Number.isFinite(promotionalPrice) ||
    promotionalPrice < 0 ||
    promotionalPrice >= originalPrice
  ) {
    errors.value.promotionalPrice = 'Promo price must be below the original price.'
  }

  if (!deal.value.location.trim()) {
    errors.value.location = 'Enter a location.'
  }

  return Object.keys(errors.value).length === 0
}

// Save draft or local preview
function saveDeal(status: 'draft' | 'preview') {
  message.value = ''
  errors.value = {}

  if (status !== 'draft' && !validate()) {
    return
  }

  saving.value = true

  try {
    // Get the original price
    let originalPrice: number | null = null

    if (deal.value.originalPrice !== '') {
      originalPrice = Number(deal.value.originalPrice)
    }

    // Get the promotional price
    let promotionalPrice: number | null = null

    if (deal.value.promotionalPrice !== '') {
      promotionalPrice = Number(deal.value.promotionalPrice)
    }

    // Get the photo filename
    let photoName: string | null = null

    if (deal.value.photo !== null) {
      photoName = deal.value.photo.name
    }

    // Create a new deal object
    const newDeal = {
      merchantName: deal.value.merchantName.trim(),
      title: deal.value.title.trim(),
      description: deal.value.description.trim(),
      cuisine: deal.value.cuisine,
      originalPrice: originalPrice,
      promotionalPrice: promotionalPrice,
      location: deal.value.location.trim(),
      status: status === 'draft' ? 'draft' : 'local-preview',
      photo: photoName,
    }

    // Copy the existing deals into a new array
    const updatedDeals: unknown[] = []

    for (let i = 0; i < savedDeals.value.length; i++) {
      updatedDeals.push(savedDeals.value[i])
    }

    // Add the new deal
    updatedDeals.push(newDeal)

    // Save the updated list in localStorage
    localStorage.setItem('student_deals', JSON.stringify(updatedDeals))

    // Update the reactive array
    savedDeals.value = updatedDeals

    // Display a message
    if (status === 'draft') {
      message.value = 'Local draft saved!'
    } else {
      message.value = 'Local preview saved! This deal has not been submitted to the community.'
    }
  } catch (error) {
    console.error('Unable to save the deal:', error)
    message.value = 'Unable to save the deal locally.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="container py-5" style="max-width: 850px">

    <div class="mb-4">
      <h1 class="fw-bold">Add a Deal</h1>

      <p class="text-secondary">
        Share a promotion with the student community.
      </p>

      <p class="text-warning">
        Prototype only: deals are saved in this browser and are not submitted to a server.
      </p>
    </div>

    <div v-if="message" class="alert alert-info" role="status">
      {{ message }}
    </div>

    <form
      class="card border-0 shadow-sm p-4"
      @submit.prevent="saveDeal('preview')"
    >

      <h2 class="h5 mb-3">Merchant information</h2>

      <!~~ Merchant name ~~>
      <div class="mb-3">
        <label class="form-label" for="merchantName">
          Merchant name *
        </label>

        <input
          id="merchantName"
          v-model="deal.merchantName"
          class="form-control"
          :class="{ 'is-invalid': errors.merchantName }"
          :aria-invalid="errors.merchantName ? 'true' : 'false'"
          :aria-describedby="errors.merchantName ? 'merchantNameError' : undefined"
        />

        <div
          v-if="errors.merchantName"
          id="merchantNameError"
          class="invalid-feedback"
        >
          {{ errors.merchantName }}
        </div>
      </div>

      <!~~ Deal title ~~>
      <div class="mb-3">
        <label class="form-label" for="dealTitle">
          Deal title *
        </label>

        <input
          id="dealTitle"
          v-model="deal.title"
          class="form-control"
          :class="{ 'is-invalid': errors.title }"
          :aria-invalid="errors.title ? 'true' : 'false'"
          :aria-describedby="errors.title ? 'titleError' : undefined"
          placeholder="e.g. Student lunch set"
        />

        <div
          v-if="errors.title"
          id="titleError"
          class="invalid-feedback"
        >
          {{ errors.title }}
        </div>
      </div>

      <!~~ Description ~~>
      <div class="mb-3">
        <label class="form-label" for="description">
          Description
        </label>

        <textarea
          id="description"
          v-model="deal.description"
          class="form-control"
          rows="3"
          placeholder="Describe what's included and any conditions."
        ></textarea>
      </div>

      <!~~ Cuisine ~~>
      <div class="mb-3">
        <label class="form-label" for="cuisine">
          Cuisine *
        </label>

        <select
          id="cuisine"
          v-model="deal.cuisine"
          class="form-select"
          :class="{ 'is-invalid': errors.cuisine }"
          :aria-invalid="errors.cuisine ? 'true' : 'false'"
          :aria-describedby="errors.cuisine ? 'cuisineError' : undefined"
        >
          <option value="" disabled>Select cuisine</option>

          <option
            v-for="cuisine in cuisines"
            :key="cuisine"
            :value="cuisine"
          >
            {{ cuisine }}
          </option>
        </select>

        <div
          v-if="errors.cuisine"
          id="cuisineError"
          class="invalid-feedback"
        >
          {{ errors.cuisine }}
        </div>
      </div>

      <!~~ Pricing ~~>
      <h2 class="h5 mt-3 mb-3">Promotional pricing</h2>

      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label" for="originalPrice">
            Original price (S$) *
          </label>

          <input
            id="originalPrice"
            v-model="deal.originalPrice"
            type="number"
            min="0.01"
            step="0.01"
            class="form-control"
            :class="{ 'is-invalid': errors.originalPrice }"
            :aria-invalid="errors.originalPrice ? 'true' : 'false'"
            :aria-describedby="errors.originalPrice ? 'originalPriceError' : undefined"
          />

          <div
            v-if="errors.originalPrice"
            id="originalPriceError"
            class="invalid-feedback"
          >
            {{ errors.originalPrice }}
          </div>
        </div>

        <div class="col-md-6">
          <label class="form-label" for="promotionalPrice">
            Promo price (S$) *
          </label>

          <input
            id="promotionalPrice"
            v-model="deal.promotionalPrice"
            type="number"
            min="0"
            step="0.01"
            class="form-control"
            :class="{ 'is-invalid': errors.promotionalPrice }"
            :aria-invalid="errors.promotionalPrice ? 'true' : 'false'"
            :aria-describedby="errors.promotionalPrice ? 'promoPriceError' : undefined"
          />

          <div
            v-if="errors.promotionalPrice"
            id="promoPriceError"
            class="invalid-feedback"
          >
            {{ errors.promotionalPrice }}
          </div>
        </div>
      </div>

      <!~~ Deal photo ~~>
      <div class="mt-4 mb-3">
        <label class="form-label" for="photo">
          Deal photo
        </label>

        <input
          id="photo"
          type="file"
          accept="image/*"
          class="form-control"
          :class="{ 'is-invalid': errors.photo }"
          :aria-invalid="errors.photo ? 'true' : 'false'"
          :aria-describedby="errors.photo ? 'photoError' : undefined"
          @change="selectPhoto"
        />

        <div
          v-if="errors.photo"
          id="photoError"
          class="invalid-feedback"
        >
          {{ errors.photo }}
        </div>

        <img
          v-if="photoPreview"
          :src="photoPreview"
          alt="Deal preview"
          class="img-thumbnail mt-3"
          style="max-height: 220px"
        />
      </div>

      <!~~ Deal location ~~>
      <h2 class="h5 mt-3 mb-3">Deal location</h2>

      <div class="mb-4">
        <label class="form-label" for="location">
          Search or add location *
        </label>

        <input
          id="location"
          v-model="deal.location"
          class="form-control"
          :class="{ 'is-invalid': errors.location }"
          :aria-invalid="errors.location ? 'true' : 'false'"
          :aria-describedby="errors.location ? 'locationError' : 'locationHelp'"
          placeholder="Enter a building, street or postal code"
        />

        <div
          v-if="errors.location"
          id="locationError"
          class="invalid-feedback"
        >
          {{ errors.location }}
        </div>

        <div id="locationHelp" class="form-text">
          OneMap suggestions are not connected yet.
        </div>
      </div>

      <!~~ Action buttons ~~>
      <div class="d-flex flex-wrap gap-2 justify-content-end">
        <button
          type="button"
          class="btn btn-outline-secondary"
          :disabled="saving"
          @click="saveDeal('draft')"
        >
          {{ saving ? 'Saving...' : 'Save draft' }}
        </button>

        <button
          type="submit"
          class="btn btn-primary"
          :disabled="saving"
        >
          {{ saving ? 'Saving...' : 'Save local preview' }}
        </button>
      </div>

    </form>
  </main>
</template>
-->
