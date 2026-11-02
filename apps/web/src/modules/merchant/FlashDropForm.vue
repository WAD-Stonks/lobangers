<script setup lang="ts">
import {
  FLASH_DROP_DURATIONS,
  FLASH_DROP_MAX_CODES,
  FLASH_DROP_MIN_CODES,
  FLASH_DROP_RADII,
} from '@broke-oclock/contracts/flash-drops'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { useUnsavedChanges } from '@web/lib/use-unsaved-changes'
import ChoiceChips from '@web/modules/merchant/ChoiceChips.vue'
import FakeBadge from '@web/modules/merchant/FakeBadge.vue'
import {
  bannerPreview,
  type FlashDropFormState,
  type FlashDropProblem,
  flashDropFormProblem,
  moneyText,
  outletAfterDealChange,
  outletsForDeal,
  radiusLabel,
  startLimits,
  stepCodes,
} from '@web/modules/merchant/flash-drop-rules'
import type { MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import { computed, nextTick, ref } from 'vue'

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
const problem = ref<FlashDropProblem | null>(null)
const formEl = ref<HTMLFormElement | null>(null)

// Each problem shows under its own field; one with no field shows above the buttons.
const fieldError = (field: FlashDropProblem['field']) =>
  problem.value?.field === field ? problem.value.message : ''
const invalid = (field: FlashDropProblem['field']) => (fieldError(field) ? 'true' : undefined)
const describedBy = (field: FlashDropProblem['field'], ...rest: string[]) =>
  [fieldError(field) ? `flash-${field}-error` : '', ...rest].filter(Boolean).join(' ') || undefined

// Cancel or leaving the page asks first once anything has changed.
const isDirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(props.initial))
const { confirmDiscard } = useUnsavedChanges(isDirty)
const cancel = () => {
  if (confirmDiscard()) emit('cancel')
}

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

const send = async () => {
  if (props.saving) return // already sending: ignore a second click
  problem.value = flashDropFormProblem(form.value, deal.value, new Date())
  if (problem.value) {
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }
  emit('submit', { ...form.value })
}

// A problem with no field of its own first; otherwise whatever the server said.
const shownError = computed(() => fieldError('form') || (problem.value ? '' : props.serverError))
</script>

<template>
  <form ref="formEl" class="card card-body mb-4" novalidate aria-labelledby="flash-form-title" @submit.prevent="send">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h3 id="flash-form-title" class="h4 mb-0 title" tabindex="-1">
        {{ editing ? 'Edit and resend flash drop' : 'New flash drop' }}
      </h3>
      <FakeBadge v-if="sample" />
    </div>

    <label for="flash-deal" class="form-label">Which deal?</label>
    <select
      id="flash-deal"
      v-model="form.dealId"
      name="dealId"
      class="form-select"
      :class="fieldError('dealId') ? 'is-invalid mb-1' : 'mb-3'"
      :aria-invalid="invalid('dealId')"
      :aria-describedby="describedBy('dealId')"
      :disabled="editing"
      @change="onDealChange"
    >
      <option value="">Choose a deal</option>
      <option v-for="item in deals" :key="item.id" :value="item.id">{{ item.title }}</option>
    </select>
    <p v-if="fieldError('dealId')" id="flash-dealId-error" class="small text-danger mb-3" role="alert">
      {{ fieldError('dealId') }}
    </p>

    <div class="row g-3 mb-3">
      <div class="col-sm-6">
        <label for="flash-price" class="form-label">Flash price ($)</label>
        <input
          id="flash-price"
          v-model.number="form.priceDollars"
          name="priceDollars"
          autocomplete="off"
          type="number"
          inputmode="decimal"
          min="0.01"
          step="0.01"
          placeholder="e.g. 1.50…"
          class="form-control"
          :class="{ 'is-invalid': fieldError('priceDollars') }"
          :aria-invalid="invalid('priceDollars')"
          :aria-describedby="describedBy('priceDollars', 'flash-price-hint')"
        />
        <p v-if="fieldError('priceDollars')" id="flash-priceDollars-error" class="small text-danger mt-1 mb-0" role="alert">
          {{ fieldError('priceDollars') }}
        </p>
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
      :invalid="!!fieldError('outletId')"
      :describedby="describedBy('outletId')"
    />
    <p v-if="fieldError('outletId')" id="flash-outletId-error" class="small text-danger mt-n2 mb-3" role="alert">
      {{ fieldError('outletId') }}
    </p>

    <ChoiceChips v-model="form.startMode" name="flash-start" legend="Starts" :choices="startChoices" />
    <div v-if="form.startMode === 'LATER'" class="mb-3">
      <label for="flash-start-at" class="form-label">Start time</label>
      <input
        id="flash-start-at"
        v-model="form.startLocal"
        name="startAt"
        type="datetime-local"
        class="form-control"
        :class="{ 'is-invalid': fieldError('startLocal') }"
        :min="limits.min"
        :max="limits.max"
        :aria-invalid="invalid('startLocal')"
        :aria-describedby="describedBy('startLocal', 'flash-start-hint')"
      />
      <p v-if="fieldError('startLocal')" id="flash-startLocal-error" class="small text-danger mt-1 mb-0" role="alert">
        {{ fieldError('startLocal') }}
      </p>
      <p id="flash-start-hint" class="small text-secondary mt-1 mb-0">Up to 7 days from now.</p>
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
      <button type="button" class="btn btn-outline-secondary" @click="cancel">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.title {
  text-wrap: balance;
}
.step {
  width: var(--hit);
  padding: 0;
  font-size: 1.125rem;
  touch-action: manipulation;
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
  color: var(--on-ink);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
</style>
