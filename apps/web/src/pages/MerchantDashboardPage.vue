<script setup lang="ts">
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import {
  createDeal,
  type DealInput,
  endDeal,
  errorMessageFor,
  getDeals,
  getOutlets,
  type MerchantDeal,
  type MerchantOutlet,
  type OfferType,
  USE_SAMPLE_DATA,
  updateDeal,
} from '@web/modules/merchant/merchant-api'
import { computed, onMounted, ref } from 'vue'

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
const formError = ref('')

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
})
const form = ref(emptyForm())

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
  if (deal.offerType === 'FIXED_PRICE') return `$${((deal.priceCents ?? 0) / 100).toFixed(2)}`
  return offerLabels[deal.offerType]
}

const datesText = (deal: MerchantDeal) => {
  const from = deal.startDate || 'Now'
  const until = deal.endDate || 'no end date'
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

// ----- Opening and closing the form -----
const openCreateForm = () => {
  form.value = emptyForm()
  // A merchant with only one outlet will almost always pick it, so tick it for them.
  if (outlets.value.length === 1) form.value.outletIds = outlets.value.map((outlet) => outlet.id)
  editingId.value = null
  formError.value = ''
  successMessage.value = ''
  showForm.value = true
}

const openEditForm = (deal: MerchantDeal) => {
  form.value = {
    title: deal.title,
    description: deal.description,
    category: deal.category,
    cuisine: deal.cuisine ?? 'NONE',
    outletIds: [...deal.outletIds],
    offerType: deal.offerType,
    discountPercent: deal.discountPercent ?? '',
    priceDollars: deal.priceCents === null ? '' : deal.priceCents / 100,
    startDate: deal.startDate,
    endDate: deal.endDate,
    terms: deal.terms,
  }
  editingId.value = deal.id
  formError.value = ''
  successMessage.value = ''
  showForm.value = true
}

const closeForm = () => {
  showForm.value = false
}

// Returns a message describing the first problem with the form, or '' if it is fine.
const checkForm = () => {
  const f = form.value
  if (f.title.trim() === '') return 'Please give the deal a title.'
  if (f.description.trim() === '') return 'Please describe the deal.'
  if (f.category === '') return 'Please choose a category.'
  if (f.cuisine === '') return 'Please choose a cuisine, or "No specific cuisine".'
  if (f.outletIds.length === 0) return 'Please choose at least one outlet.'
  if (f.offerType === 'PERCENT_OFF') {
    if (f.discountPercent === '' || f.discountPercent < 1 || f.discountPercent > 100) {
      return 'The discount must be between 1 and 100 percent.'
    }
  }
  if (f.offerType === 'FIXED_PRICE') {
    if (f.priceDollars === '' || f.priceDollars <= 0) return 'Please enter the deal price.'
  }
  if (f.startDate && f.endDate && f.endDate < f.startDate) {
    return 'The last day cannot be before the start date.'
  }
  return ''
}

// ----- Saving (create or edit) -----
const saveDeal = async () => {
  formError.value = checkForm()
  if (formError.value) return

  const f = form.value
  // Only send a discount or price when the offer type uses it.
  const input: DealInput = {
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
    showForm.value = false
  } catch (error) {
    formError.value = errorMessageFor(error, 'Could not save the deal. Please try again.')
  } finally {
    saving.value = false
  }
}

// ----- Ending a deal early -----
const confirmEndDeal = async (deal: MerchantDeal) => {
  if (!window.confirm(`End "${deal.title}" now? Customers will stop seeing it.`)) return
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

onMounted(loadDashboard)
</script>

<template>
  <section class="container py-4">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h1 class="h2 mb-0">Merchant dashboard</h1>
      <button
        v-if="!loading && outlets.length > 0"
        type="button"
        class="btn btn-primary"
        @click="openCreateForm"
      >
        + New deal
      </button>
    </div>

    <p v-if="USE_SAMPLE_DATA" class="alert alert-warning">
      Showing sample data. Changes are not saved and reset when you refresh.
    </p>
    <p v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="alert alert-success" role="status">{{ successMessage }}</p>

    <p v-if="loading" class="text-secondary">Loading your deals…</p>

    <!-- Merchant role, but no approved outlets yet -->
    <div v-else-if="outlets.length === 0 && !errorMessage" class="card card-body">
      <p class="mb-2">You don't manage any outlets yet.</p>
      <RouterLink to="/me/merchant-access">Request access to your stall</RouterLink>
    </div>

    <template v-else-if="outlets.length > 0">
      <p class="text-secondary">
        Your outlets: {{ outlets.map((outlet) => outlet.name).join(', ') }}
      </p>

      <!-- Create / edit form -->
      <form v-if="showForm" class="card card-body mb-4" novalidate @submit.prevent="saveDeal">
        <h2 class="h4 mb-3">{{ editingId === null ? 'New deal' : 'Edit deal' }}</h2>

        <label for="deal-title" class="form-label">Title</label>
        <input id="deal-title" v-model="form.title" class="form-control mb-3" maxlength="120" />

        <label for="deal-description" class="form-label">Description</label>
        <textarea
          id="deal-description"
          v-model="form.description"
          class="form-control mb-3"
          rows="3"
          maxlength="1000"
        ></textarea>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="deal-category" class="form-label">Category</label>
            <select id="deal-category" v-model="form.category" class="form-select">
              <option value="">Choose a category</option>
              <option v-for="(label, value) in categoryLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>
          <div class="col-sm-6">
            <label for="deal-cuisine" class="form-label">Cuisine</label>
            <select id="deal-cuisine" v-model="form.cuisine" class="form-select">
              <option value="">Choose a cuisine</option>
              <option v-for="(label, value) in cuisineLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>
        </div>

        <fieldset class="mb-3">
          <legend class="form-label fs-6">Which outlets is this deal at?</legend>
          <div v-for="outlet in outlets" :key="outlet.id" class="form-check">
            <input
              :id="`outlet-${outlet.id}`"
              v-model="form.outletIds"
              :value="outlet.id"
              type="checkbox"
              class="form-check-input"
            />
            <label :for="`outlet-${outlet.id}`" class="form-check-label">
              {{ outlet.name }} <span class="text-secondary small">({{ outlet.address }})</span>
            </label>
          </div>
        </fieldset>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="deal-offer" class="form-label">Offer type</label>
            <select id="deal-offer" v-model="form.offerType" class="form-select">
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
              type="number"
              min="1"
              max="100"
              class="form-control"
            />
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
            />
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="deal-start" class="form-label">Start date (optional)</label>
            <input id="deal-start" v-model="form.startDate" type="date" class="form-control" />
          </div>
          <div class="col-sm-6">
            <label for="deal-end" class="form-label">Last day (optional)</label>
            <input id="deal-end" v-model="form.endDate" type="date" class="form-control" />
          </div>
        </div>

        <label for="deal-terms" class="form-label">Terms &amp; conditions (optional)</label>
        <textarea
          id="deal-terms"
          v-model="form.terms"
          class="form-control mb-3"
          rows="3"
          maxlength="1000"
          placeholder="One condition per line, e.g. Dine-in only"
        ></textarea>

        <p v-if="formError" class="text-danger" role="alert">{{ formError }}</p>

        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save deal' }}
          </button>
          <button type="button" class="btn btn-outline-secondary" @click="closeForm">Cancel</button>
        </div>
      </form>

      <!-- Current deals (live and scheduled) -->
      <h2 class="h4 mb-3">Current deals</h2>
      <p v-if="currentDeals.length === 0" class="text-secondary">No current deals.</p>
      <ul v-else class="list-unstyled d-grid gap-3 mb-4">
        <li v-for="deal in currentDeals" :key="deal.id" class="card card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <h3 class="h5 mb-1">{{ deal.title }}</h3>
            <span
              class="badge"
              :class="statusOf(deal) === 'Live' ? 'text-bg-success' : 'text-bg-info'"
            >
              {{ statusOf(deal) }}
            </span>
          </div>
          <p class="mb-2">{{ deal.description }}</p>
          <p class="small text-secondary mb-1">
            <strong>{{ offerText(deal) }}</strong> · {{ datesText(deal) }}
          </p>
          <p class="small text-secondary mb-1">At: {{ outletNames(deal) }}</p>
          <p v-if="deal.terms" class="small text-secondary mb-2 terms">Terms: {{ deal.terms }}</p>
          <div class="d-flex gap-2 mt-2">
            <button type="button" class="btn btn-sm btn-outline-primary" @click="openEditForm(deal)">
              Edit
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" @click="confirmEndDeal(deal)">
              End deal
            </button>
          </div>
        </li>
      </ul>

      <!-- Ended deals: view only -->
      <h2 class="h4 mb-3">Ended deals</h2>
      <p v-if="endedDeals.length === 0" class="text-secondary">No ended deals.</p>
      <ul v-else class="list-unstyled d-grid gap-3">
        <li v-for="deal in endedDeals" :key="deal.id" class="card card-body bg-body-tertiary">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <h3 class="h5 mb-1">{{ deal.title }}</h3>
            <span class="badge text-bg-secondary">Ended</span>
          </div>
          <p class="small text-secondary mb-1">
            <strong>{{ offerText(deal) }}</strong> · {{ datesText(deal) }}
          </p>
          <p class="small text-secondary mb-0">At: {{ outletNames(deal) }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
/* Keep the line breaks the merchant typed in the terms box. */
.terms {
  white-space: pre-line;
}
</style>
