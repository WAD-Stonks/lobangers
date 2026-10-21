<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import { sortByDistance } from '@web/modules/browse-map/distance'
import type { Coordinates } from '@web/modules/browse-map/types'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

// Every outlet running a deal, nearest first when the visitor is located. Picking one moves the
// panel and the map to it without adding a history entry per outlet. Long chains show the
// nearest few until the visitor asks for the rest.
const COLLAPSED_COUNT = 5

const props = defineProps<{
  deal: DealPin
  currentVenueId: string
  position: Coordinates | null
  to: (venueId: string) => RouteLocationRaw
}>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()

const expanded = ref(false)

type Outlet = DealPin['venues'][number] & { readonly distanceMetres: number | null }

const outlets = computed<readonly Outlet[]>(() =>
  props.position
    ? sortByDistance(props.deal.venues, props.position)
    : props.deal.venues.map((venue) => ({ ...venue, distanceMetres: null })),
)
// The outlet being viewed always stays visible, even when it is not among the nearest few.
const shown = computed(() => {
  if (expanded.value || outlets.value.length <= COLLAPSED_COUNT) return outlets.value
  const nearest = outlets.value.slice(0, COLLAPSED_COUNT)
  const current = outlets.value.find((outlet) => outlet.id === props.currentVenueId)
  return current && !nearest.includes(current) ? [...nearest.slice(0, -1), current] : nearest
})
const hiddenCount = computed(() => outlets.value.length - shown.value.length)
</script>

<template>
  <section v-if="outlets.length > 1" aria-labelledby="deal-outlets-title" data-testid="deal-outlets">
    <h2 id="deal-outlets-title" class="deal-outlets__label">
      {{ position ? 'Outlets near you' : 'Outlets' }}
      <span class="deal-outlets__count">{{ outlets.length }}</span>
    </h2>
    <ol class="deal-outlets">
      <li v-for="outlet in shown" :key="outlet.id">
        <RouterLink
          :to="to(outlet.id)"
          replace
          class="deal-outlets__row"
          :class="{ 'is-current': outlet.id === currentVenueId }"
          :aria-current="outlet.id === currentVenueId ? 'location' : undefined"
          @mouseenter="emit('hover', outlet.id)"
          @mouseleave="emit('hover', null)"
          @focus="emit('hover', outlet.id)"
          @blur="emit('hover', null)"
        >
          <span class="deal-outlets__name">{{ outlet.name }}</span>
          <span v-if="outlet.distanceMetres !== null" class="deal-outlets__walk lb-meta">
            <ShellIcon name="walk" :size="14" />{{ walkMinutesFor(outlet.distanceMetres) }} min
          </span>
        </RouterLink>
      </li>
    </ol>
    <button
      v-if="hiddenCount > 0"
      type="button"
      class="deal-outlets__more"
      data-testid="deal-outlets-more"
      @click="expanded = true"
    >
      Show all {{ outlets.length }} outlets
    </button>
  </section>
</template>

<style scoped>
.deal-outlets__label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.deal-outlets__count {
  padding: 1px 7px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  color: var(--ink);
  background: var(--paper-sunk);
  border-radius: var(--radius-pill);
}

.deal-outlets {
  display: flex;
  flex-direction: column;
  margin: 0 -8px;
  padding: 0;
  list-style: none;
}

.deal-outlets__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  min-height: var(--hit);
  padding: 8px 10px;
  font-size: 0.875rem;
  color: var(--ink);
  text-decoration: none;
  border-radius: 12px;
  transition:
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease;
}

.deal-outlets__row:active {
  transform: scale(0.98);
}

.deal-outlets__row.is-current {
  font-weight: 600;
  background: var(--sunny-wash);
}

@media (hover: hover) and (pointer: fine) {
  .deal-outlets__row:hover {
    color: var(--ink);
    background: var(--paper-hover);
  }

  .deal-outlets__row.is-current:hover {
    background: var(--sunny-wash);
  }
}

.deal-outlets__row:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -2px;
}

.deal-outlets__name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.deal-outlets__walk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.deal-outlets__more {
  min-height: var(--hit);
  margin-top: var(--space-1);
  padding: 0;
  font: 600 0.875rem/1 var(--font-sans);
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
  border: 0;
  cursor: pointer;
}

.deal-outlets__more:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .deal-outlets__row:active {
    transform: none;
  }
}
</style>
