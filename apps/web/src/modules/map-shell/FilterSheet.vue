<script setup lang="ts">
import { DEAL_CUISINE_LABELS, type DealCuisine } from '@broke-oclock/contracts/deal-cuisines'
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
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import type { Breakpoint } from '@web/modules/map-shell/use-breakpoint'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

// All filters. Changes apply straight away, so the pins, the list and "Show N deals" move
// together; the first change in a session adds a history entry and the rest refine it, so one
// Back undoes the whole session. Desktop: a popover under the chips. Tablet: a centred dialog.
// Phone: full screen. Tablet and desktop fit without scrolling inside.
const props = defineProps<{
  open: boolean
  breakpoint: Breakpoint
  filters: BrowseFilters
  categories: readonly string[]
  cuisines: readonly DealCuisine[]
  countFor: (filters: BrowseFilters) => number
  locationKnown: boolean
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
let changedThisSession = false

const modal = computed(() => props.breakpoint !== 'desktop')
const budget = computed(() =>
  props.filters.priceMaxMinor === null ? BUDGET_MAX : Math.min(BUDGET_MAX, props.filters.priceMaxMinor / CENTS),
)
const budgetLabel = computed(() =>
  props.filters.priceMaxMinor === null ? 'Any price' : `Up to $${(props.filters.priceMaxMinor / CENTS).toFixed(2)}`,
)
const total = computed(() => props.countFor(props.filters))
const showLabel = computed(() =>
  total.value === 0 ? 'No matches yet' : `Show ${total.value} ${total.value === 1 ? 'deal' : 'deals'}`,
)

const apply = (next: BrowseFilters) => {
  emit('apply', next, changedThisSession ? 'replace' : 'push')
  changedThisSession = true
}

// "(n)" next to an option: how many deals there would be after tapping it.
const countWith = (next: BrowseFilters) => `(${props.countFor(next)})`

const setBudget = (event: Event) => {
  const dollars = Number((event.target as HTMLInputElement).value)
  apply(updateFilters(props.filters, 'priceMaxMinor', dollars >= BUDGET_MAX ? null : Math.round(dollars * CENTS)))
}

const categoryOptions = computed(() =>
  props.categories.map((code) => {
    const value = code.toUpperCase()
    const on = props.filters.categories.includes(value)
    const next = updateFilters(props.filters, 'categories', toggleValue(props.filters.categories, value))
    return { value, label: formatCategory(code), on, next, count: on ? '' : countWith(next) }
  }),
)
const cuisineOptions = computed(() =>
  props.cuisines.map((value) => {
    const on = props.filters.cuisines.includes(value)
    const next = updateFilters(props.filters, 'cuisines', toggleValue(props.filters.cuisines, value))
    return { value, label: DEAL_CUISINE_LABELS[value], on, next, count: on ? '' : countWith(next) }
  }),
)
const offerOptions = computed(() =>
  OFFER_TYPES.map((type) => {
    const on = props.filters.offerTypes.includes(type)
    const next = updateFilters(props.filters, 'offerTypes', toggleValue(props.filters.offerTypes, type))
    return { value: type, label: OFFER_TYPE_LABELS[type], on, next, count: on ? '' : countWith(next) }
  }),
)

const focusables = () =>
  [...(sheet.value?.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
    (element) => !element.hasAttribute('disabled'),
  )

// Escape closes; on tablet and phone Tab cycles inside the dialog.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !modal.value) return
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

// The desktop popover closes on a click elsewhere, except on the chip that toggles it.
const onPointerDownOutside = (event: PointerEvent) => {
  const target = event.target as HTMLElement | null
  if (!props.open || modal.value || !target || sheet.value?.contains(target)) return
  if (target.closest('[data-testid="all-filters"]')) return
  emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      changedThisSession = false
      document.addEventListener('pointerdown', onPointerDownOutside)
      await nextTick()
      sheet.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else {
      document.removeEventListener('pointerdown', onPointerDownOutside)
    }
  },
)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDownOutside))
</script>

<template>
  <Transition name="shell-fade">
    <div v-if="open && breakpoint === 'tablet'" class="filter-scrim" aria-hidden="true" @click="emit('close')" />
  </Transition>
  <Transition name="shell-sheet">
    <section
      v-if="open"
      id="filter-sheet"
      ref="sheet"
      class="filter-sheet lb-card"
      :class="`filter-sheet--${breakpoint}`"
      role="dialog"
      :aria-modal="modal ? 'true' : undefined"
      aria-labelledby="filter-sheet-title"
      data-testid="filter-sheet"
      @keydown="onKeydown"
    >
      <div class="filter-sheet__head">
        <h2 id="filter-sheet-title" class="filter-sheet__title lb-display">Filters</h2>
        <button type="button" class="lb-ctrl lb-ctrl--flat" aria-label="Close filters" data-autofocus @click="emit('close')">
          <ShellIcon name="close" :size="16" />
        </button>
      </div>

      <div class="filter-sheet__body" data-testid="filter-sheet-body">
        <div class="filter-sheet__group">
          <div class="filter-sheet__row">
            <label class="filter-sheet__label" for="filter-budget">Budget</label>
            <span class="filter-sheet__value lb-display" aria-live="polite">{{ budgetLabel }}</span>
          </div>
          <input
            id="filter-budget"
            class="filter-sheet__range"
            type="range"
            :min="BUDGET_MIN"
            :max="BUDGET_MAX"
            :step="BUDGET_STEP"
            :value="budget"
            :aria-valuetext="budgetLabel"
            @input="setBudget"
          />
          <div class="filter-sheet__row lb-meta"><span>${{ BUDGET_MIN }}</span><span>${{ BUDGET_MAX }}+</span></div>
        </div>

        <!-- Hidden, not disabled, until the visitor shares a location (open question 3). -->
        <fieldset v-if="locationKnown" class="filter-sheet__group">
          <legend class="visually-hidden">Walking distance</legend>
          <span class="filter-sheet__label" aria-hidden="true">Walking distance</span>
          <div class="filter-sheet__seg">
            <button
              type="button"
              :aria-pressed="filters.walkMinutes === null"
              @click="apply(updateFilters(filters, 'walkMinutes', null))"
            >
              Any
            </button>
            <button
              v-for="minutes in WALK_MINUTE_OPTIONS"
              :key="minutes"
              type="button"
              :aria-pressed="filters.walkMinutes === minutes"
              @click="apply(updateFilters(filters, 'walkMinutes', minutes))"
            >
              {{ minutes }} min
            </button>
          </div>
        </fieldset>

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
              @click="apply(option.next)"
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
              @click="apply(option.next)"
            >
              <span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>
              {{ option.label }} <span class="lb-chip__count">{{ option.count }}</span>
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
              @click="apply(option.next)"
            >
              <span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>
              {{ option.label }} <span class="lb-chip__count">{{ option.count }}</span>
            </button>
          </div>
        </fieldset>

        <fieldset class="filter-sheet__group">
          <legend class="visually-hidden">Ending</legend>
          <span class="filter-sheet__label" aria-hidden="true">Ending</span>
          <div class="filter-sheet__seg filter-sheet__seg--three">
            <button
              v-for="option in ENDING_OPTIONS"
              :key="option.value"
              type="button"
              :aria-pressed="filters.ending === option.value"
              @click="apply(updateFilters(filters, 'ending', option.value))"
            >
              {{ option.label }}
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
              :aria-checked="filters.validNow"
              aria-labelledby="filter-valid"
              @click="apply(updateFilters(filters, 'validNow', !filters.validNow))"
            />
          </div>
        </div>
      </div>

      <div class="filter-sheet__foot">
        <button
          type="button"
          class="lb-btn lb-btn--ghost filter-sheet__clear"
          data-testid="filter-clear"
          @click="apply({ ...createDefaultFilters(), q: filters.q })"
        >
          Clear all
        </button>
        <button type="button" class="lb-btn lb-btn--ink filter-sheet__show" data-testid="filter-show" @click="emit('close')">
          {{ showLabel }}
        </button>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.filter-scrim {
  position: absolute;
  inset: 0;
  z-index: 45;
  background: rgba(29, 29, 34, 0.38);
}

.filter-sheet {
  position: absolute;
  z-index: 50;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* Desktop: a popover that grows from the chips, over the top of the panel. */
.filter-sheet--desktop {
  --sheet-enter-transform: scale(0.97);
  top: calc(var(--shell-header-bottom, 136px) + var(--space-2));
  left: var(--shell-gutter);
  width: min(780px, calc(100vw - 2rem));
  max-height: calc(100dvh - var(--shell-header-bottom, 136px) - 2rem);
  transform-origin: top left;
}

/* Tablet: a dialog that grows from the centre. */
.filter-sheet--tablet {
  --sheet-enter-transform: translate(-50%, -50%) scale(0.97);
  top: 50%;
  left: 50%;
  width: min(760px, 94vw);
  max-height: calc(100dvh - 2rem);
  transform: translate(-50%, -50%);
}

/* Phone: full screen, sliding up; here the page scrolls instead of the map. */
.filter-sheet--phone {
  --sheet-enter-transform: translateY(24px);
  position: fixed;
  inset: 0;
  overflow-y: auto;
  border: 0;
  border-radius: 0;
  overscroll-behavior: contain;
}

.filter-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 4px 24px;
}

.filter-sheet__title {
  margin: 0;
  font-size: 1.5rem;
}

.filter-sheet__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  align-content: start;
  min-height: 0;
  padding: 0 24px 6px;
}

.filter-sheet--phone .filter-sheet__body {
  grid-template-columns: minmax(0, 1fr);
  flex: 1 0 auto;
}

.filter-sheet__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  margin: 0;
  padding: 12px 0;
  border: 0;
  box-shadow: inset 0 1px 0 var(--hairline);
}

.filter-sheet__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.filter-sheet__label {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 700;
}

.filter-sheet__value {
  font-size: 1.25rem;
  color: var(--coral-deep);
}

.filter-sheet__range {
  width: 100%;
  height: 28px;
  accent-color: var(--coral);
}

.filter-sheet__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Segmented control: equal buttons on a sunk track, the chosen one lifts out. */
.filter-sheet__seg {
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
    background-color var(--dur-small) ease,
    color var(--dur-small) ease;
}

.filter-sheet__seg button[aria-pressed='true'] {
  color: var(--ink);
  background: var(--paper-white);
  box-shadow: 0 3px 10px rgba(27, 27, 31, 0.1);
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
  background: var(--paper-white);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(27, 27, 31, 0.25);
  transition: transform var(--dur-small) var(--ease-out);
}

.filter-sheet__switch[aria-checked='true']::before {
  background: var(--ok);
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 24px max(12px, env(safe-area-inset-bottom));
  background: var(--paper-white);
  border-top: 1px solid var(--hairline);
}

.filter-sheet--phone .filter-sheet__foot {
  position: sticky;
  bottom: 0;
}

.filter-sheet__clear {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.filter-sheet__show {
  min-width: 180px;
}

@media (prefers-reduced-motion: reduce) {
  .filter-sheet__switch::after {
    transition: none;
  }
}
</style>
