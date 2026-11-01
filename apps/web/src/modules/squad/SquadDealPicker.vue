<script setup lang="ts">
import { SQUAD_MAX_DEALS } from '@broke-oclock/contracts/squad'
import { formatDistance } from '@web/modules/browse-map/distance'
import { useShell } from '@web/modules/map-shell/shell-state'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { nearestDeals, type PickableDeal, toggleDealId } from '@web/modules/squad/squad-forms'
import { computed, ref } from 'vue'

// Deals to vote on: the visitor's saved deals first, then everything nearby, nearest first.
// Picked deals always stay in view, so a deal brought in from its page is never hidden.
const PAGE = 8
const props = withDefaults(
  defineProps<{ modelValue: readonly string[]; exclude?: readonly string[]; max?: number }>(),
  { exclude: () => [], max: SQUAD_MAX_DEALS },
)
const emit = defineEmits<{ 'update:modelValue': [ids: readonly string[]] }>()

const shell = useShell()
const saved = useSavedDeals()
const shown = ref(PAGE)

const all = computed(() =>
  nearestDeals(shell.deals.value, shell.position.value).filter((row) => !props.exclude.includes(row.deal.id)),
)
const savedRows = computed(() => all.value.filter((row) => saved.isSaved(row.deal.id)))
const nearbyAll = computed(() => all.value.filter((row) => !saved.isSaved(row.deal.id)))
const nearby = computed(() =>
  nearbyAll.value.filter((row, index) => index < shown.value || props.modelValue.includes(row.deal.id)),
)
const hasMore = computed(() => nearbyAll.value.length > nearby.value.length)
const full = computed(() => props.modelValue.length >= props.max)
const sections = computed(() =>
  [
    { key: 'saved', title: 'Your saved deals', rows: savedRows.value },
    { key: 'near', title: shell.position.value ? 'Near you' : 'On the map', rows: nearby.value },
  ].filter((section) => section.rows.length > 0),
)

const isOn = (row: PickableDeal) => props.modelValue.includes(row.deal.id)
const meta = (row: PickableDeal) =>
  [row.venueName, row.distanceMetres === null ? null : formatDistance(row.distanceMetres), row.deal.label]
    .filter(Boolean)
    .join(' · ')
const toggle = (row: PickableDeal) => emit('update:modelValue', toggleDealId(props.modelValue, row.deal.id, props.max))
</script>

<template>
  <fieldset class="squad-picker">
    <legend class="squad-picker__legend">
      <span class="squad-field__label">Deals to vote on</span>
      <span class="squad-picker__count" data-testid="squad-picked-count" aria-live="polite">
        {{ modelValue.length }} of {{ max }} picked
      </span>
    </legend>

    <p v-if="shell.status.value === 'loading' && all.length === 0" class="squad-picker__note" role="status">
      Finding deals near you…
    </p>
    <div v-else-if="shell.status.value === 'error' && all.length === 0" class="squad-picker__note" role="alert">
      <p>Could not load deals.</p>
      <button type="button" class="lb-btn squad-btn-dark squad-btn-small" @click="shell.reload()">Try again</button>
    </div>
    <p v-else-if="all.length === 0" class="squad-picker__note">
      No other deals on the map right now. Check back soon.
    </p>

    <section v-for="section in sections" :key="section.key" class="squad-picker__section" :aria-label="section.title">
      <h2 class="squad-picker__heading">{{ section.title }}</h2>
      <ul class="squad-picker__list">
        <li v-for="row in section.rows" :key="row.deal.id">
          <label class="squad-dchip" :class="{ 'is-on': isOn(row), 'is-off': full && !isOn(row) }">
            <input
              class="visually-hidden"
              type="checkbox"
              :checked="isOn(row)"
              :disabled="full && !isOn(row)"
              :data-testid="`squad-pick-${row.deal.id}`"
              @change="toggle(row)"
            />
            <span class="squad-dchip__text">
              <strong>{{ row.deal.title }}</strong>
              <span>{{ meta(row) }}</span>
            </span>
            <span class="squad-dchip__check" aria-hidden="true">{{ isOn(row) ? '✓' : '' }}</span>
          </label>
        </li>
      </ul>
    </section>

    <button v-if="hasMore" type="button" class="squad-link" @click="shown += PAGE">Show more deals</button>
    <p v-if="full" class="squad-picker__note" role="status">That's the most a room can vote on. Untick one to swap it.</p>
  </fieldset>
</template>
