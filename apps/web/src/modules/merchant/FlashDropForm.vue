<script setup lang="ts">
import {
  FLASH_DROP_DURATIONS,
  FLASH_DROP_MAX_CODES,
  FLASH_DROP_MIN_CODES,
  FLASH_DROP_RADII,
} from '@broke-oclock/contracts/flash-drops'
import ChoiceChips from '@web/modules/merchant/ChoiceChips.vue'
import FakeBadge from '@web/modules/merchant/FakeBadge.vue'
import {
  bannerPreview,
  checkFlashDropForm,
  type FlashDropFormState,
  moneyText,
  outletAfterDealChange,
  outletsForDeal,
  radiusLabel,
  startLimits,
  stepCodes,
} from '@web/modules/merchant/flash-drop-rules'
import type { MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import { computed, ref } from 'vue'

const props = defineProps<{
  deals: MerchantDeal[] // only the merchant's current deals
  outlets: MerchantOutlet[]
  initial: FlashDropFormState
  editing: boolean // true when fixing a drop that was sent back
  saving: boolean
  serverError: string
  sample: boolean // sample data: show the "Fake deal" label
}>()

const emit = defineEmits<{
  submit: [form: FlashDropFormState]
  cancel: []
}>()

// The form keeps its own copy; the parent gives it a new key each time it opens.
const form = ref<FlashDropFormState>({ ...props.initial })
const formError = ref('')

const deal = computed(() => props.deals.find((item) => item.id === form.value.dealId))
const outletChoices = computed(() =>
  outletsForDeal(deal.value, props.outlets).map((outlet) => ({
    value: outlet.id,
    label: outlet.name,
  })),
)
const limits = computed(() => startLimits(new Date()))
const preview = computed(() => bannerPreview(form.value, deal.value))

const startChoices = [
  { value: 'NOW' as const, label: 'Now' },
  { value: 'LATER' as const, label: 'Pick a time' },
]
const durationChoices = FLASH_DROP_DURATIONS.map((value) => ({ value, label: `${value} min` }))
const radiusChoices = FLASH_DROP_RADII.map((value) => ({ value, label: radiusLabel(value) }))

// A new deal may not run at the outlet that was picked, so pick again where needed.
const onDealChange = () => {
  form.value = {
    ...form.value,
    outletId: outletAfterDealChange(form.value.outletId, deal.value, props.outlets),
  }
}

const changeCodes = (direction: 1 | -1) => {
  form.value = { ...form.value, codeLimit: stepCodes(form.value.codeLimit, direction) }
}

const send = () => {
  if (props.saving) return // already sending: ignore a second click
  formError.value = checkFlashDropForm(form.value, deal.value, new Date())
  if (formError.value) return
  emit('submit', { ...form.value })
}

// Our own check first; otherwise whatever the server said.
const shownError = computed(() => formError.value || props.serverError)
</script>

<template>
  <form class="card card-body mb-4" novalidate aria-labelledby="flash-form-title" @submit.prevent="send">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h3 id="flash-form-title" class="h4 mb-0" tabindex="-1">
        {{ editing ? 'Edit and resend flash drop' : 'New flash drop' }}
      </h3>
      <FakeBadge v-if="sample" />
    </div>

    <label for="flash-deal" class="form-label">Which deal?</label>
    <select
      id="flash-deal"
      v-model="form.dealId"
      class="form-select mb-3"
      :disabled="editing"
      @change="onDealChange"
    >
      <option value="">Choose a deal</option>
      <option v-for="item in deals" :key="item.id" :value="item.id">{{ item.title }}</option>
    </select>

    <div class="row g-3 mb-3">
      <div class="col-sm-6">
        <label for="flash-price" class="form-label">Flash price ($)</label>
        <input
          id="flash-price"
          v-model.number="form.priceDollars"
          type="number"
          inputmode="decimal"
          min="0.01"
          step="0.01"
          placeholder="e.g. 1.50"
          class="form-control"
          aria-describedby="flash-price-hint"
        />
        <p id="flash-price-hint" class="small text-secondary mt-1 mb-0">
          <template v-if="deal?.priceCents">Usual price {{ moneyText(deal.priceCents) }}.</template>
          <template v-else>Pick a price people will notice.</template>
        </p>
      </div>
      <div class="col-sm-6">
        <fieldset>
          <legend class="form-label fs-6">Codes to give out</legend>
          <div class="d-flex align-items-center gap-2">
            <button
              type="button"
              class="btn btn-outline-secondary step"
              aria-label="Fewer codes"
              :disabled="form.codeLimit <= FLASH_DROP_MIN_CODES"
              @click="changeCodes(-1)"
            >
              −
            </button>
            <output class="codes" aria-live="polite">{{ form.codeLimit }}</output>
            <button
              type="button"
              class="btn btn-outline-secondary step"
              aria-label="More codes"
              :disabled="form.codeLimit >= FLASH_DROP_MAX_CODES"
              @click="changeCodes(1)"
            >
              +
            </button>
          </div>
        </fieldset>
      </div>
    </div>

    <ChoiceChips
      v-if="outletChoices.length > 0"
      v-model="form.outletId"
      name="flash-outlet"
      legend="Outlet (the drop circles this stall)"
      :choices="outletChoices"
    />

    <ChoiceChips v-model="form.startMode" name="flash-start" legend="Starts" :choices="startChoices" />
    <div v-if="form.startMode === 'LATER'" class="mb-3">
      <label for="flash-start-at" class="form-label">Start time</label>
      <input
        id="flash-start-at"
        v-model="form.startLocal"
        type="datetime-local"
        class="form-control"
        :min="limits.min"
        :max="limits.max"
      />
      <p class="small text-secondary mt-1 mb-0">Up to 7 days from now.</p>
    </div>

    <ChoiceChips v-model="form.durationMinutes" name="flash-length" legend="Lasts" :choices="durationChoices" />
    <ChoiceChips
      v-model="form.radiusMetres"
      name="flash-radius"
      legend="Who sees the banner"
      :choices="radiusChoices"
    />

    <p class="small text-secondary mb-1">Preview of the banner on the map</p>
    <p class="banner mb-3" data-testid="flash-preview">{{ preview }}</p>

    <p v-if="shownError" class="text-danger" role="alert">{{ shownError }}</p>
    <p class="small text-secondary">
      LoBangers checks every flash drop before it goes live, usually within 30 minutes.
    </p>

    <div class="d-flex flex-wrap gap-2">
      <button type="submit" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Sending…' : 'Send for review' }}
      </button>
      <button type="button" class="btn btn-outline-secondary" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.step {
  width: var(--hit);
  padding: 0;
  font-size: 1.125rem;
}
.codes {
  min-width: 3rem;
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
/* Dark banner like the one on the map. */
.banner {
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--ink-strong);
  color: var(--paper-white);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
</style>
