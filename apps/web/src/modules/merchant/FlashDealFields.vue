<script setup lang="ts">
import {
  FLASH_DROP_DURATIONS,
  FLASH_DROP_MAX_CODES,
  FLASH_DROP_MIN_CODES,
  FLASH_DROP_RADII,
} from '@broke-oclock/contracts/flash-drops'
import ChoiceChips from '@web/modules/merchant/ChoiceChips.vue'
import type { MerchantFlashDrop } from '@web/modules/merchant/flash-drop-api'
import {
  bannerPreview,
  type FlashField,
  type FlashFieldsState,
  type FlashProblem,
  radiusLabel,
  startLimits,
  stepCodes,
} from '@web/modules/merchant/flash-drop-rules'
import { computed } from 'vue'

// The flash part of the deal form: codes, when it starts, how long it lasts and who sees the
// banner. The flash offer itself is the deal form's own Offer type above. The deal form owns the
// state and checks it; this only shows it.
const props = defineProps<{
  title: string // the deal's title, for the banner preview
  offer: Pick<MerchantFlashDrop, 'offerType' | 'discountPercent' | 'flashPriceCents'>
  problem: FlashProblem | null
}>()

const fields = defineModel<FlashFieldsState>({ required: true })

const fieldError = (field: FlashField) =>
  props.problem?.field === field ? props.problem.message : ''
const invalid = (field: FlashField) => (fieldError(field) ? 'true' : undefined)
const describedBy = (field: FlashField, ...rest: string[]) =>
  [fieldError(field) ? `error-${field}` : '', ...rest].filter(Boolean).join(' ') || undefined

const limits = computed(() => startLimits(new Date()))
const preview = computed(() => bannerPreview(fields.value, props.title, props.offer))

const startChoices = [
  { value: 'GO_LIVE' as const, label: 'When I press Go live' },
  { value: 'LATER' as const, label: 'Pick a time' },
]
const durationChoices = FLASH_DROP_DURATIONS.map((value) => ({ value, label: `${value} min` }))
const radiusChoices = FLASH_DROP_RADII.map((value) => ({ value, label: radiusLabel(value) }))

const changeCodes = (direction: 1 | -1) => {
  fields.value = { ...fields.value, codeLimit: stepCodes(fields.value.codeLimit, direction) }
}
</script>

<template>
  <fieldset class="flash-fields mb-3" aria-labelledby="flash-fields-title">
    <h3 id="flash-fields-title" class="h5 mb-1">Flash deal</h3>
    <p class="small text-secondary">
      The offer above is the flash offer. Saved as a draft: nobody sees it until you press
      <strong>Go live</strong> in Flash deals.
    </p>

    <div class="row g-3 mb-3">
      <!-- Only a fixed flash price has a usual price to show the saving against. -->
      <div v-if="offer.offerType === 'FIXED_PRICE'" class="col-sm-6">
        <label for="flash-usual" class="form-label">Usual price ($, optional)</label>
        <input
          id="flash-usual"
          v-model.number="fields.usualDollars"
          name="flashUsual"
          autocomplete="off"
          type="number"
          inputmode="decimal"
          min="0.01"
          step="0.01"
          placeholder="e.g. 4.00…"
          class="form-control"
          :class="{ 'is-invalid': fieldError('flashUsual') }"
          :aria-invalid="invalid('flashUsual')"
          :aria-describedby="describedBy('flashUsual', 'flash-usual-hint')"
        />
        <p v-if="fieldError('flashUsual')" id="error-flashUsual" class="small text-danger mt-1 mb-0">
          {{ fieldError('flashUsual') }}
        </p>
        <p id="flash-usual-hint" class="small text-secondary mt-1 mb-0">
          Shown crossed out next to the flash price, so people see the saving.
        </p>
      </div>
      <div class="col-sm-6">
        <fieldset :aria-describedby="describedBy('flashCodes')">
          <legend class="form-label fs-6">Codes to give out</legend>
          <div class="d-flex align-items-center gap-2">
            <button
              type="button"
              class="btn btn-outline-secondary step"
              aria-label="Fewer codes"
              :disabled="fields.codeLimit <= FLASH_DROP_MIN_CODES"
              @click="changeCodes(-1)"
            >
              −
            </button>
            <output class="codes" aria-live="polite">{{ fields.codeLimit }}</output>
            <button
              type="button"
              class="btn btn-outline-secondary step"
              aria-label="More codes"
              :disabled="fields.codeLimit >= FLASH_DROP_MAX_CODES"
              @click="changeCodes(1)"
            >
              +
            </button>
          </div>
          <p v-if="fieldError('flashCodes')" id="error-flashCodes" class="small text-danger mt-1 mb-0">
            {{ fieldError('flashCodes') }}
          </p>
        </fieldset>
      </div>
    </div>

    <ChoiceChips v-model="fields.startMode" name="flash-start" legend="Starts" :choices="startChoices" />
    <div v-if="fields.startMode === 'LATER'" class="mb-3">
      <label for="flash-start-at" class="form-label">Start time</label>
      <input
        id="flash-start-at"
        v-model="fields.startLocal"
        name="flashStart"
        type="datetime-local"
        class="form-control"
        :class="{ 'is-invalid': fieldError('flashStart') }"
        :min="limits.min"
        :max="limits.max"
        :aria-invalid="invalid('flashStart')"
        :aria-describedby="describedBy('flashStart', 'flash-start-hint')"
      />
      <p v-if="fieldError('flashStart')" id="error-flashStart" class="small text-danger mt-1 mb-0">
        {{ fieldError('flashStart') }}
      </p>
      <p id="flash-start-hint" class="small text-secondary mt-1 mb-0">
        Up to 7 days from now. It still only goes live once you press Go live.
      </p>
    </div>

    <ChoiceChips v-model="fields.durationMinutes" name="flash-length" legend="Lasts" :choices="durationChoices" />
    <ChoiceChips
      v-model="fields.radiusMetres"
      name="flash-radius"
      legend="Who sees the banner"
      :choices="radiusChoices"
    />

    <p class="small text-secondary mb-1">Preview of the banner on the map</p>
    <p class="banner mb-0" data-testid="flash-preview">{{ preview }}</p>
  </fieldset>
</template>

<style scoped>
/* A coral edge marks the flash part apart from the rest of the deal form. */
.flash-fields {
  padding-left: 12px;
  border-left: 4px solid var(--coral);
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
