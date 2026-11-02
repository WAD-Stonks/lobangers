<script setup lang="ts">
import { DEAL_CUISINE_LABELS, type DealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import { formatMoneyMajor, formatMoneyMinor } from '@web/lib/format'
import { formatCategory } from '@web/modules/browse-map/deal-format'
import {
  type BrowseFilters,
  createDefaultFilters,
  type EndingWindow,
  OFFER_TYPE_LABELS,
  OFFER_TYPES,
  toggleValue,
  updateFilters,
  WALK_MINUTE_OPTIONS,
} from '@web/modules/browse-map/filters'
import LocationFilter from '@web/modules/browse-map/LocationFilter.vue'
import { locationLabel } from '@web/modules/browse-map/location-filter'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import type { Breakpoint } from '@web/modules/map-shell/use-breakpoint'
import { computed, nextTick, ref, watch } from 'vue'

// Filter changes stay local until "Show N deals" is pressed. Closing discards the draft.
// A centred modal with a scrolling body; header and actions stay visible.
const props = defineProps<{
  open: boolean
  breakpoint: Breakpoint
  filters: BrowseFilters
  categories: readonly string[]
  cuisines: readonly DealCuisine[]
  countFor: (filters: BrowseFilters) => number
  showLocation?: boolean
  locationKnown: boolean
  inactive?: boolean
  priceValues?: readonly number[]
}>()
const emit = defineEmits<{ apply: [filters: BrowseFilters, mode: 'push' | 'replace']; close: [] }>()

const BUDGET_MIN = 2
const BUDGET_MAX = 15
const BUDGET_STEP = 0.5
const CENTS = 100
const ENDING_OPTIONS: readonly { value: EndingWindow; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
]

const sheet = ref<HTMLElement | null>(null)
const draft = ref<BrowseFilters>({ ...props.filters })

const budget = computed(() =>
  draft.value.priceMaxMinor === null ? BUDGET_MAX : Math.min(BUDGET_MAX, draft.value.priceMaxMinor / CENTS),
)
const budgetLabel = computed(() =>
  draft.value.priceMaxMinor === null ? 'Any fixed price' : `Up to ${formatMoneyMinor(draft.value.priceMaxMinor)}`,
)
const priceHistogram = computed(() => {
  const bins = Array.from({ length: Math.round((BUDGET_MAX - BUDGET_MIN) / BUDGET_STEP) + 1 }, (_, index) => ({
    from: BUDGET_MIN + index * BUDGET_STEP,
    count: 0,
  }))
  for (const minor of props.priceValues ?? []) {
    if (!Number.isFinite(minor) || minor < 0) continue
    const index = Math.max(0, Math.min(bins.length - 1, Math.floor((minor / CENTS - BUDGET_MIN) / BUDGET_STEP)))
    const bin = bins[index]
    if (bin) bin.count++
  }
  const maximum = Math.max(1, ...bins.map((bin) => bin.count))
  return bins.map((bin, index) => ({
    ...bin,
    height: bin.count / maximum * 100,
    selected: draft.value.priceMaxMinor === null || bin.from <= budget.value,
    label: `${index === 0 ? `Under ${formatMoneyMinor((BUDGET_MIN + BUDGET_STEP) * CENTS)}` : index === bins.length - 1 ? `${formatMoneyMajor(BUDGET_MAX)}+` : `${formatMoneyMinor(bin.from * CENTS)}–${formatMoneyMinor((bin.from + BUDGET_STEP) * CENTS)}`}: ${bin.count} ${bin.count === 1 ? 'deal' : 'deals'}`,
  }))
})
const fixedPriceCount = computed(() => priceHistogram.value.reduce((sum, bin) => sum + bin.count, 0))
const budgetProgress = computed(() => Math.max(0, Math.min(100, (budget.value - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN) * 100)))
const total = computed(() => props.countFor(draft.value))
// Position of the sliding pill in each segmented control.
const walkSegment = computed(() => ({
  '--seg-count': WALK_MINUTE_OPTIONS.length + 1,
  '--seg-index': (WALK_MINUTE_OPTIONS as readonly (number | null)[]).indexOf(draft.value.walkMinutes) + 1,
}))
const endingSegment = computed(() => ({
  '--seg-count': ENDING_OPTIONS.length,
  '--seg-index': Math.max(0, ENDING_OPTIONS.findIndex((option) => option.value === draft.value.ending)),
}))

const updateDraft = (next: BrowseFilters) => {
  draft.value = next
}

// "(n)" next to an option: how many deals there would be after tapping it. An option that would
// leave nothing is disabled rather than letting the visitor filter themselves into an empty list.
const chipOption = <T>(value: T, label: string, on: boolean, next: BrowseFilters) => {
  const matches = on ? null : props.countFor(next)
  return { value, label, on, next, count: matches === null ? '' : `(${matches})`, empty: matches === 0 }
}

const setBudget = (event: Event) => {
  const dollars = Number((event.target as HTMLInputElement).value)
  updateDraft(updateFilters(draft.value, 'priceMaxMinor', dollars >= BUDGET_MAX ? null : Math.round(dollars * CENTS)))
}

const categoryOptions = computed(() =>
  props.categories.map((code) => {
    const value = code.toUpperCase()
    const on = draft.value.categories.includes(value)
    const next = updateFilters(draft.value, 'categories', toggleValue(draft.value.categories, value))
    return chipOption(value, formatCategory(code), on, next)
  }),
)
const cuisineOptions = computed(() =>
  props.cuisines.map((value) => {
    const on = draft.value.cuisines.includes(value)
    const next = updateFilters(draft.value, 'cuisines', toggleValue(draft.value.cuisines, value))
    return chipOption(value, DEAL_CUISINE_LABELS[value], on, next)
  }),
)
const offerOptions = computed(() =>
  OFFER_TYPES.map((type) => {
    const on = draft.value.offerTypes.includes(type)
    const next = updateFilters(draft.value, 'offerTypes', toggleValue(draft.value.offerTypes, type))
    return chipOption(type, OFFER_TYPE_LABELS[type], on, next)
  }),
)

const focusables = () =>
  [...(sheet.value?.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
    (element) => !element.hasAttribute('disabled'),
  )

// Escape closes; Tab cycles inside the dialog at every screen size.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const items = focusables()
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const clearAll = () => {
  updateDraft(createDefaultFilters())
  emit('apply', { ...draft.value }, 'push')
  emit('close')
}

const applyDraft = () => {
  emit('apply', { ...draft.value }, 'push')
  emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      draft.value = { ...props.filters }
      await nextTick()
      sheet.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
  },
  { immediate: true },
)
</script>

<template>
  <Transition name="shell-fade" :css="!inactive">
    <div v-if="open" class="filter-scrim" data-testid="filter-backdrop" aria-hidden="true" @click="emit('close')" />
  </Transition>
  <Transition name="shell-sheet" :css="!inactive">
    <section
      v-if="open"
      id="filter-sheet"
      ref="sheet"
      class="filter-sheet lb-card"
      :class="`filter-sheet--${breakpoint}`"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-sheet-title"
      data-testid="filter-sheet"
      :inert="inactive ? true : undefined"
      @keydown="onKeydown"
    >
      <div class="filter-sheet__head">
        <h2 id="filter-sheet-title" class="filter-sheet__title lb-display">Filters</h2>
        <button type="button" class="lb-ctrl lb-ctrl--flat" aria-label="Close filters" data-autofocus @click="emit('close')">
          <ShellIcon name="close" :size="16" />
        </button>
      </div>

      <div class="filter-sheet__body" data-testid="filter-sheet-body">
        <details v-if="showLocation !== false" class="filter-sheet__group filter-sheet__location" data-testid="filter-location-section">
          <summary>
            <span class="filter-sheet__label">Location</span>
            <span class="filter-sheet__location-value lb-meta">{{ draft.location ? locationLabel(draft.location) : 'Anywhere' }}</span>
            <ShellIcon class="filter-sheet__location-chevron" name="chevronDown" :size="18" />
          </summary>
          <div class="filter-sheet__location-content">
            <LocationFilter :model-value="draft.location" @update:model-value="updateDraft(updateFilters(draft, 'location', $event))" />
          </div>
        </details>

        <div class="filter-sheet__group">
          <div class="filter-sheet__row">
            <label class="filter-sheet__label" for="filter-budget">Budget</label>
            <span class="filter-sheet__value lb-display" aria-live="polite">{{ budgetLabel }}</span>
          </div>
          <span class="filter-sheet__hint lb-meta">Deals without a fixed price remain included.</span>
          <div class="filter-sheet__budget-chart">
          <div v-if="fixedPriceCount" class="filter-sheet__histogram" role="img" :aria-label="`Price distribution of ${fixedPriceCount} fixed-price deals`" data-testid="price-histogram">
            <span v-for="(bin, index) in priceHistogram" :key="index" class="filter-sheet__price-bar" :class="{ 'is-selected': bin.selected }" :style="{ height: `${bin.height}%`, '--i': index }" :title="bin.label" />
          </div>
          <p v-else class="lb-meta filter-sheet__histogram-empty">No fixed-price deals available.</p>
          <input
            id="filter-budget"
            class="filter-sheet__range"
            type="range"
            :min="BUDGET_MIN"
            :max="BUDGET_MAX"
            :step="BUDGET_STEP"
            :value="budget"
            :aria-valuetext="budgetLabel"
            :style="{ '--budget-progress': `${budgetProgress}%` }"
            @input="setBudget"
          />
          </div>
          <div class="filter-sheet__row lb-meta"><span>{{ formatMoneyMajor(BUDGET_MIN) }}</span><span>{{ formatMoneyMajor(BUDGET_MAX) }}+</span></div>
        </div>

        <fieldset v-if="categoryOptions.length" class="filter-sheet__group">
          <legend class="visually-hidden">Category</legend>
          <span class="filter-sheet__label" aria-hidden="true">Category</span>
          <div class="filter-sheet__chips">
            <button
              v-for="option in categoryOptions"
              :key="option.value"
              type="button"
              class="lb-chip"
              :aria-pressed="option.on"
              :disabled="option.empty"
              @click="updateDraft(option.next)"
            >
              <span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>
              {{ option.label }} <span class="lb-chip__count">{{ option.count }}</span>
            </button>
          </div>
        </fieldset>

        <fieldset v-if="cuisineOptions.length" class="filter-sheet__group">
          <legend class="visually-hidden">Cuisine</legend>
          <span class="filter-sheet__label" aria-hidden="true">Cuisine</span>
          <div class="filter-sheet__chips">
            <button
              v-for="option in cuisineOptions"
              :key="option.value"
              type="button"
              class="lb-chip"
              :aria-pressed="option.on"
              :disabled="option.empty"
              @click="updateDraft(option.next)"
            >
              <span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>
              {{ option.label }} <span class="lb-chip__count">{{ option.count }}</span>
            </button>
          </div>
        </fieldset>

        <!-- Hidden, not disabled, until the visitor shares a location (open question 3). -->
        <fieldset v-if="locationKnown" class="filter-sheet__group">
          <legend class="visually-hidden">Walking distance</legend>
          <span class="filter-sheet__label" aria-hidden="true">Walking distance</span>
          <div class="filter-sheet__seg" :style="walkSegment">
            <button
              type="button"
              :aria-pressed="draft.walkMinutes === null"
              @click="updateDraft(updateFilters(draft, 'walkMinutes', null))"
            >
              Any
            </button>
            <button
              v-for="minutes in WALK_MINUTE_OPTIONS"
              :key="minutes"
              type="button"
              :aria-pressed="draft.walkMinutes === minutes"
              @click="updateDraft(updateFilters(draft, 'walkMinutes', minutes))"
            >
              {{ minutes }} min
            </button>
          </div>
        </fieldset>

        <fieldset class="filter-sheet__group">
          <legend class="visually-hidden">Expiry</legend>
          <span class="filter-sheet__label" aria-hidden="true">Expiry</span>
          <div class="filter-sheet__seg filter-sheet__seg--three" :style="endingSegment">
            <button
              v-for="option in ENDING_OPTIONS"
              :key="option.value"
              type="button"
              :aria-pressed="draft.ending === option.value"
              @click="updateDraft(updateFilters(draft, 'ending', option.value))"
            >
              {{ option.label }}
            </button>
          </div>
        </fieldset>

        <fieldset class="filter-sheet__group">
          <legend class="visually-hidden">Deal type</legend>
          <span class="filter-sheet__label" aria-hidden="true">Deal type</span>
          <div class="filter-sheet__chips">
            <button
              v-for="option in offerOptions"
              :key="option.value"
              type="button"
              class="lb-chip"
              :aria-pressed="option.on"
              :disabled="option.empty"
              @click="updateDraft(option.next)"
            >
              <span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>
              {{ option.label }} <span class="lb-chip__count">{{ option.count }}</span>
            </button>
          </div>
        </fieldset>

        <div class="filter-sheet__group">
          <div class="filter-sheet__row">
            <span class="filter-sheet__switch-text">
              <span id="filter-valid" class="filter-sheet__label">Valid now</span>
              <span class="lb-meta">Hide deals past their end date</span>
            </span>
            <button
              type="button"
              role="switch"
              class="filter-sheet__switch"
              :aria-checked="draft.validNow"
              aria-labelledby="filter-valid"
              @click="updateDraft(updateFilters(draft, 'validNow', !draft.validNow))"
            />
          </div>
        </div>
      </div>

      <div class="filter-sheet__foot">
        <button
          type="button"
          class="lb-btn lb-btn--ghost filter-sheet__clear"
          data-testid="filter-clear"
          @click="clearAll"
        >
          Clear all
        </button>
        <button type="button" class="lb-btn lb-btn--primary filter-sheet__show" data-testid="filter-show" @click="applyDraft">
          <template v-if="total === 0">No matches yet</template>
          <span v-else>Show <span :key="total" class="lb-tick">{{ total }}</span> {{ total === 1 ? 'deal' : 'deals' }}</span>
        </button>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.filter-sheet__group.filter-sheet__location { display: block; }
.filter-sheet__location summary { display: flex; align-items: center; gap: 12px; min-height: 44px; list-style: none; cursor: pointer; }
.filter-sheet__location summary::-webkit-details-marker { display: none; }
.filter-sheet__location summary:focus-visible { outline: 3px solid var(--sunny-ring); outline-offset: 3px; border-radius: 6px; }
.filter-sheet__location-value { margin-left: auto; }
.filter-sheet__location-chevron { transition: transform var(--dur-small) var(--ease-out); }
.filter-sheet__location[open] .filter-sheet__location-chevron { transform: rotate(180deg); }
.filter-sheet__location-content { padding-top: 16px; }


.filter-scrim {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: var(--scrim);
}

.filter-sheet {
  --sheet-enter-transform: translate(-50%, -50%) scale(0.97);
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 50;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(680px, calc(100vw - 32px));
  height: min(88dvh, 900px);
  max-height: calc(100dvh - 32px);
  overflow: hidden;
  border-radius: 28px;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.22);
  transform: translate(-50%, -50%);
}

/* Keep a small inset on phones while giving the filter controls most of the screen. */
.filter-sheet--phone {
  width: calc(100vw - 16px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
  height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  border-radius: 22px;
}

.filter-sheet__head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  flex: none;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--hairline);
}

.filter-sheet__head button {
  grid-column: 3;
}

.filter-sheet__title {
  grid-column: 2;
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1.2rem;
  font-weight: 750;
  text-align: center;
}

.filter-sheet__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  min-height: 0;
  padding: 0 28px;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.filter-sheet__group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  margin: 0;
  padding: 24px 0;
  border: 0;
  box-shadow: inset 0 1px 0 var(--hairline);
}

.filter-sheet__group:first-child {
  box-shadow: none;
}

.filter-sheet__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.filter-sheet__label {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.filter-sheet__value {
  font-size: 1.25rem;
  color: var(--coral-deep);
}

.filter-sheet__range {
  width: 100%;
  height: 28px;
  display: block;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.filter-sheet__budget-chart { padding: 12px 12px 0; }
.filter-sheet__histogram { display: flex; align-items: end; gap: 3px; height: 100px; padding: 0 1px; margin-bottom: -12px; }
.filter-sheet__price-bar { flex: 1; min-width: 0; background: var(--paper-sunk); border-radius: 3px 3px 0 0; transform-origin: bottom; transition: background-color 120ms ease; animation: price-bar-grow 240ms var(--ease-out) backwards; animation-delay: calc(var(--i, 0) * 8ms); }
/* Bars rise from the baseline, left to right, as the sheet opens. */
@keyframes price-bar-grow { from { opacity: 0; transform: scaleY(0.15); } }
.filter-sheet__price-bar.is-selected { background: var(--coral-deep); }
.filter-sheet__histogram-empty { margin: 0 0 12px; }
.filter-sheet__range::-webkit-slider-runnable-track { height: 3px; background: linear-gradient(to right, var(--coral-deep) var(--budget-progress), var(--hairline-strong) var(--budget-progress)); }
.filter-sheet__range::-moz-range-track { height: 3px; background: var(--hairline-strong); }
.filter-sheet__range::-moz-range-progress { height: 3px; background: var(--coral-deep); }
.filter-sheet__range::-webkit-slider-thumb { appearance: none; width: 28px; height: 28px; margin-top: -12.5px; border: 1px solid var(--hairline-strong); border-radius: 50%; background: var(--paper-white); box-shadow: 0 2px 8px rgb(0 0 0 / 0.1); }
.filter-sheet__range::-moz-range-thumb { width: 28px; height: 28px; border: 1px solid var(--hairline-strong); border-radius: 50%; background: var(--paper-white); box-shadow: 0 2px 8px rgb(0 0 0 / 0.1); }

.filter-sheet__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Segmented control: equal buttons on a sunk track, the chosen one lifts out. */
.filter-sheet__seg {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  background: var(--paper-sunk);
  border-radius: var(--radius-pill);
}

.filter-sheet__seg--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

/* One pill slides under the chosen option instead of each button lighting up on its own.
   translateX percentages are the pill's own width, so each step is one width plus the 4px gap. */
.filter-sheet__seg::before {
  content: '';
  position: absolute;
  z-index: -1;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px - (var(--seg-count) - 1) * 4px) / var(--seg-count));
  background: var(--paper-white);
  border-radius: var(--radius-pill);
  box-shadow: 0 3px 10px rgba(27, 27, 31, 0.1);
  transform: translateX(calc(var(--seg-index) * (100% + 4px)));
  transition: transform var(--dur-panel) var(--ease-in-out);
}

.filter-sheet__seg button {
  min-height: var(--hit);
  padding: 0 4px;
  font: 700 0.8125rem/1.1 var(--font-sans);
  color: var(--ink-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition:
    color var(--dur-small) ease,
    transform var(--dur-press) var(--ease-out);
}

.filter-sheet__seg button[aria-pressed='true'] {
  color: var(--ink);
}

.filter-sheet__seg button:active {
  transform: scale(0.96);
}

.filter-sheet__switch-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 48x28 switch drawn inside a 48x44 target. */
.filter-sheet__switch {
  position: relative;
  flex: none;
  width: 48px;
  height: var(--hit);
  padding: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.filter-sheet__switch::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 0;
  width: 48px;
  height: 28px;
  background: var(--track);
  border-radius: var(--radius-pill);
  transition: background-color var(--dur-small) ease;
}

.filter-sheet__switch::after {
  content: '';
  position: absolute;
  top: 11px;
  left: 3px;
  width: 22px;
  height: 22px;
  background: var(--switch-knob);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(27, 27, 31, 0.25);
  transition: transform var(--dur-small) var(--ease-out);
}

.filter-sheet__switch[aria-checked='true']::before {
  background: var(--coral-deep);
}

.filter-sheet__switch[aria-checked='true']::after {
  transform: translateX(20px);
}

.filter-sheet__switch:focus-visible,
.filter-sheet__seg button:focus-visible,
.filter-sheet__range:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.filter-sheet__foot {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 24px max(12px, env(safe-area-inset-bottom));
  background: var(--paper-white);
  border-top: 1px solid var(--hairline);
}

.filter-sheet--phone .filter-sheet__body {
  padding-inline: 20px;
}

.filter-sheet--phone .filter-sheet__foot {
  padding-inline: 16px;
}

.filter-sheet__clear {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.filter-sheet__clear:hover {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  font-weight: 800;
}

.filter-sheet__show {
  min-width: 180px;
}

.filter-sheet--phone .filter-sheet__show {
  min-width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .filter-sheet__switch::after,
  .filter-sheet__seg::before,
  .filter-sheet__location-chevron {
    transition: none;
  }

  .filter-sheet__price-bar {
    animation: none;
  }

  .filter-sheet__seg button:active {
    transform: none;
  }
}
</style>
