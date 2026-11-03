<script setup lang="ts">
import { DEAL_CUISINE_LABELS, type DealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import { formatMoneyMajor } from '@web/lib/format'
import { formatCategory } from '@web/modules/browse-map/deal-format'
import {
  type BrowseFilters, countSheetFilters, createDefaultFilters,
  toggleValue,
} from '@web/modules/browse-map/filters'
import LocationFilter from '@web/modules/browse-map/LocationFilter.vue'
import { locationLabel } from '@web/modules/browse-map/location-filter'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps<{
  filters: BrowseFilters
  categories: readonly string[]
  cuisines: readonly DealCuisine[]
  countFor: (filters: BrowseFilters) => number
  showLocation?: boolean
  locationKnown: boolean
  sheetOpen: boolean
}>()
const emit = defineEmits<{ apply: [filters: BrowseFilters]; openSheet: [] }>()
type QuickKey = 'location' | 'price' | 'cuisine' | 'category' | 'ending'
const fields = { location: 'location', price: 'priceMaxMinor', cuisine: 'cuisines', category: 'categories', ending: 'ending' } as const
const labels = { location: 'Location', price: 'Price', cuisine: 'Cuisine', category: 'Category', ending: 'Expiry' }
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const allButton = ref<HTMLButtonElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const active = ref<QuickKey | null>(null)
const draft = ref<BrowseFilters>({ ...props.filters })
const panelLeft = ref(0)
// The popover grows out of the chip that opened it.
const panelOrigin = ref('0px')
const panelId = useId()
const count = computed(() => countSheetFilters(props.filters))
const keys = computed<QuickKey[]>(() => [
  ...(props.showLocation === false ? [] : ['location' as const]), 'price', ...(props.cuisines.length ? ['cuisine' as const] : []), 'category', 'ending',
])
const isOn = (key: QuickKey) => {
  if (key === 'location') return Boolean(props.filters.location.trim())
  const value = props.filters[fields[key]]
  return Array.isArray(value) ? value.length > 0 : value !== null && value !== 'any'
}
const chipLabel = (key: QuickKey) => {
  if (key === 'location' && props.filters.location.trim()) return locationLabel(props.filters.location)
  if (key === 'price' && props.filters.priceMaxMinor !== null) return `Up to ${formatMoneyMajor(props.filters.priceMaxMinor / 100)}`
  if (key === 'cuisine' && props.filters.cuisines.length) return `Cuisine · ${props.filters.cuisines.length}`
  if (key === 'category' && props.filters.categories.length) return `Category · ${props.filters.categories.length}`
  if (key === 'ending' && props.filters.ending !== 'any') return props.filters.ending === 'today' ? 'Expiry today' : 'Expiry this week'
  return labels[key]
}
const candidate = computed<BrowseFilters>(() => active.value
  ? { ...props.filters, [fields[active.value]]: draft.value[fields[active.value]] }
  : props.filters)
const total = computed(() => props.countFor(candidate.value))
const close = (restoreFocus = false) => {
  active.value = null
  if (restoreFocus) trigger.value?.focus()
}
const toggle = async (key: QuickKey, event: Event) => {
  if (active.value === key) return close()
  trigger.value = event.currentTarget as HTMLButtonElement
  draft.value = { ...props.filters }
  active.value = key
  const bounds = root.value?.getBoundingClientRect()
  const button = trigger.value.getBoundingClientRect()
  panelLeft.value = bounds ? Math.max(0, Math.min(button.left - bounds.left, bounds.width - Math.min(420, bounds.width))) : 0
  panelOrigin.value = bounds ? `${button.left + button.width / 2 - bounds.left - panelLeft.value}px` : '0px'
  await nextTick()
  panel.value?.querySelector<HTMLElement>('input, button')?.focus()
}
const emptyValue = (key: QuickKey) =>
  key === 'location' ? '' : key === 'cuisine' || key === 'category' ? [] : key === 'ending' ? 'any' : null
const clear = () => {
  if (!active.value) return
  draft.value = { ...draft.value, [fields[active.value]]: emptyValue(active.value) }
  emit('apply', candidate.value)
  close(true)
}
// The ✕ on an active chip removes that one filter; focus moves to the chip it was attached to.
const remove = async (key: QuickKey) => {
  close()
  emit('apply', { ...props.filters, [fields[key]]: emptyValue(key) })
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-testid="quick-${key}"]`)?.focus()
}
const clearAll = () => {
  close()
  emit('apply', createDefaultFilters())
  allButton.value?.focus()
}
const apply = () => {
  emit('apply', candidate.value)
  close(true)
}
const setPrice = (event: Event) => {
  const input = event.target as HTMLInputElement
  const value = input.valueAsNumber
  draft.value = { ...draft.value, priceMaxMinor: input.value === '' || !Number.isFinite(value) ? null : Math.round(Math.max(0, Math.min(10000, value)) * 100) }
}
const outside = (event: PointerEvent) => {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}
const onEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && active.value) { event.preventDefault(); close(true) }
}
watch(() => props.sheetOpen, () => close())
watch(() => props.filters, () => close())
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', onEscape)
  window.addEventListener('resize', closeOnResize)
})
const closeOnResize = () => close()
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', onEscape)
  window.removeEventListener('resize', closeOnResize)
})
defineExpose({ focusAllFilters: () => allButton.value?.focus() })
</script>

<template>
  <div ref="root" class="discovery-filters" data-testid="discovery-quick-filters">
    <fieldset class="discovery-filters__chips">
      <legend class="visually-hidden">Quick filters</legend>
      <button ref="allButton" class="lb-chip discovery-filters__all" type="button" aria-haspopup="dialog" :aria-expanded="sheetOpen" aria-controls="filter-sheet" data-testid="all-filters" @click="close(); emit('openSheet')">
        <ShellIcon name="filters" :size="16" />Filters
        <span v-if="count" :key="count" class="lb-badge discovery-filters__badge" data-testid="filter-badge">{{ count }}<span class="visually-hidden"> active</span></span>
      </button>
      <span class="discovery-filters__separator" aria-hidden="true" />
      <span v-for="key in keys" :key="key" class="discovery-filters__pair">
        <button class="lb-chip" :class="{ 'is-selected': isOn(key) }" type="button" aria-haspopup="dialog" :aria-expanded="active === key" :aria-controls="active === key ? panelId : undefined" :data-testid="`quick-${key}`" @click="toggle(key, $event)">
          {{ chipLabel(key) }}<ShellIcon class="discovery-filters__chevron" name="chevronDown" :size="14" />
        </button>
        <Transition name="shell-chip">
          <button v-if="isOn(key)" class="discovery-filters__remove" type="button" :aria-label="`Remove ${labels[key]} filter`" @click="remove(key)">
            <ShellIcon name="close" :size="12" :stroke-width="2.6" />
          </button>
        </Transition>
      </span>
      <Transition name="shell-chip">
        <button v-if="count || filters.q.trim()" class="discovery-filters__clear-all" type="button" data-testid="clear-all-filters" @click="clearAll">Clear all</button>
      </Transition>
    </fieldset>

    <Transition name="shell-menu">
    <section v-if="active" :id="panelId" :key="active" ref="panel" class="discovery-filters__popover lb-card" :style="{ left: `${panelLeft}px`, transformOrigin: `${panelOrigin} top` }" role="dialog" :aria-label="`${labels[active]} filter`" data-testid="quick-filter-popover">
      <header class="discovery-filters__heading"><h2>{{ labels[active] }}</h2><button class="lb-ctrl lb-ctrl--flat" type="button" aria-label="Close quick filter" @click="close(true)"><ShellIcon name="close" :size="16" /></button></header>
      <div class="discovery-filters__body">
        <LocationFilter v-if="active === 'location'" v-model="draft.location" />
        <template v-else-if="active === 'price'">
          <label class="discovery-filters__price-label" :for="`${panelId}-price`">Maximum fixed price (S$)</label>
          <input :id="`${panelId}-price`" class="discovery-filters__price" type="number" name="max-price" inputmode="decimal" min="0" max="10000" step="0.5" placeholder="Any price…" :value="draft.priceMaxMinor === null ? '' : draft.priceMaxMinor / 100" @input="setPrice" />
          <div class="discovery-filters__options"><button v-for="price in [500, 1000, 1500]" :key="price" class="lb-chip" type="button" :aria-pressed="draft.priceMaxMinor === price" @click="draft = { ...draft, priceMaxMinor: price }"><span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>Up to {{ formatMoneyMajor(price / 100) }}</button></div>
          <p class="lb-meta">Percentage discounts, bundles and deals without a fixed price remain included.</p>
        </template>
        <div v-else-if="active === 'cuisine'" class="discovery-filters__options"><button v-for="cuisine in cuisines" :key="cuisine" class="lb-chip" type="button" :aria-pressed="draft.cuisines.includes(cuisine)" @click="draft = { ...draft, cuisines: toggleValue(draft.cuisines, cuisine) }"><span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>{{ DEAL_CUISINE_LABELS[cuisine] }}</button></div>
        <div v-else-if="active === 'category'" class="discovery-filters__options"><button v-for="category in categories" :key="category" class="lb-chip" type="button" :aria-pressed="draft.categories.includes(category.toUpperCase())" @click="draft = { ...draft, categories: toggleValue(draft.categories, category.toUpperCase()) }"><span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>{{ formatCategory(category) }}</button></div>
        <div v-else-if="active === 'ending'" class="discovery-filters__options"><button v-for="option in [{ value: 'any', label: 'Any time' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }] as const" :key="option.value" class="lb-chip" type="button" :aria-pressed="draft.ending === option.value" @click="draft = { ...draft, ending: option.value }"><span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>{{ option.label }}</button></div>
      </div>
      <footer class="discovery-filters__footer"><button class="lb-btn lb-btn--ghost" type="button" @click="clear">Clear</button><button class="lb-btn lb-btn--ink" type="button" data-testid="quick-filter-apply" @click="apply"><span>Show <span :key="total" class="lb-tick">{{ total }}</span> {{ total === 1 ? 'deal' : 'deals' }}</span></button></footer>
    </section>
    </Transition>
  </div>
</template>

<style scoped>
.discovery-filters__clear-all {
  min-height: var(--hit);
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--coral-deep);
  background: transparent;
  font: 600 0.8125rem / 1.2 var(--font-sans);
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
  cursor: pointer;
}
.discovery-filters__clear-all:hover {
  background: transparent;
  font-weight: 800;
}
.discovery-filters__clear-all:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}


/* An active chip makes room on its right for a ✕ that sits inside the pill. */
.discovery-filters__pair { position: relative; display: inline-flex; flex: none; }
.discovery-filters__pair .lb-chip.is-selected { padding-right: 40px; }
.discovery-filters__remove {
  position: absolute;
  top: 50%;
  right: 4px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-top: -16px;
  padding: 0;
  color: var(--ink);
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 50%;
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-out), background-color 150ms ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.discovery-filters__remove:active { transform: scale(0.88); }
.discovery-filters__remove:focus-visible { outline: 3px solid var(--sunny-ring); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .discovery-filters__remove:hover { background: var(--paper-hover); }
}
.discovery-filters__chevron { transition: transform var(--dur-small) var(--ease-out); }
[aria-expanded='true'] > .discovery-filters__chevron { transform: rotate(180deg); }
/* The badge is re-keyed on every count change, so it pops each time a filter is added or removed. */
.discovery-filters__badge { animation: shell-pop 300ms var(--ease-out); }

@media (prefers-reduced-motion: reduce) {
  .discovery-filters__badge { animation: none; }
  .discovery-filters__remove:active { transform: none; }
}

.discovery-filters__separator { align-self: center; flex: 0 0 1px; width: 1px; height: 24px; margin: 0 4px; background: var(--hairline-strong); }

.discovery-filters { position: relative; min-width: 0; }
.discovery-filters__chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; min-width: 0; padding: 0; margin: 0; border: 0; }
.discovery-filters__chips .is-selected { color: var(--ink); border-color: var(--ink-strong); background: var(--paper-sunk); }
.discovery-filters__popover { position: absolute; top: calc(100% + 12px); z-index: 2; width: min(420px, 100%); max-height: min(560px, calc(100dvh - var(--shell-header-bottom) - 32px)); display: flex; flex-direction: column; overflow: hidden; border-radius: 20px; }
.discovery-filters__heading { display: flex; align-items: center; justify-content: space-between; flex: none; padding: 12px 16px 0 20px; }
.discovery-filters__heading h2 { margin: 0; font-size: 1.1rem; font-weight: 750; }
.discovery-filters__body { display: grid; gap: 16px; min-height: 0; padding: 16px 20px 20px; overflow-y: auto; overscroll-behavior: contain; }
.discovery-filters__body p { margin: 0; }
.discovery-filters__options { display: flex; flex-wrap: wrap; gap: 8px; }
.discovery-filters__price-label { font-size: var(--text-sm); font-weight: 650; }
.discovery-filters__price { width: 100%; min-height: 48px; padding: 10px 14px; border: 1px solid var(--hairline-strong); border-radius: 14px; background: var(--paper-white); color: var(--ink); font: inherit; }
.discovery-filters__price:focus-visible { outline: 3px solid var(--sunny-ring); outline-offset: 2px; }
.discovery-filters__footer { display: flex; justify-content: space-between; gap: 8px; flex: none; padding: 14px 20px; border-top: 1px solid var(--hairline); }
@media (max-width: 767.98px) {
  .discovery-filters__all,
  .discovery-filters__separator {
    display: none;
  }
  .discovery-filters__chips {
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 1px;
    scrollbar-width: none;
    padding: 3px 1px;
    -webkit-overflow-scrolling: touch;
  }
  /* Chips scroll inside their own row and settle on a chip edge; the page never scrolls sideways. */
  .discovery-filters__chips > * {
    scroll-snap-align: start;
  }
  .discovery-filters__chips::-webkit-scrollbar {
    display: none;
  }
  .discovery-filters__clear-all {
    flex: none;
  }
  /* Compact row so the chips cover less of the map; popover option chips keep the full size. */
  .discovery-filters__chips {
    gap: 6px;
  }
  .discovery-filters__chips .lb-chip,
  .discovery-filters__clear-all {
    min-height: 36px;
  }
  .discovery-filters__chips .lb-chip {
    gap: 4px;
    padding: 0 12px;
  }
  .discovery-filters__pair .lb-chip.is-selected {
    padding-right: 34px;
  }
  .discovery-filters__remove {
    width: 26px;
    height: 26px;
    margin-top: -13px;
    right: 5px;
  }
}
</style>
