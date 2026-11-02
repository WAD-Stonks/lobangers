<script setup lang="ts">
import { LOCATION_REGIONS, LOCATION_TOWNS, locationLabel } from '@web/modules/browse-map/location-filter'
import { computed, ref, useId } from 'vue'

const model = defineModel<string>({ required: true })
const search = ref('')
const searchId = useId()
const towns = computed(() => LOCATION_TOWNS.filter((town) => town.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
</script>

<template>
  <div class="location-filter">
    <fieldset class="location-filter__regions">
      <legend>Region</legend>
      <button class="lb-chip" type="button" :aria-pressed="!model" @click="model = ''">Anywhere</button>
      <button v-for="region in LOCATION_REGIONS" :key="region" class="lb-chip" type="button" :aria-pressed="model === `region:${region}`" @click="model = `region:${region}`">{{ region }}</button>
    </fieldset>
    <label :for="searchId">Town or neighbourhood</label>
    <input :id="searchId" v-model="search" type="search" name="town" placeholder="Search towns, e.g. Bedok…" autocomplete="off" spellcheck="false" />
    <p v-if="model" class="lb-meta" role="status">Selected: {{ locationLabel(model) }}</p>
    <!-- biome-ignore lint/a11y/useSemanticElements: a fieldset would add form semantics and default styling to a plain button group -->
    <div class="location-filter__towns" role="group" aria-label="Towns and neighbourhoods">
      <button v-for="town in towns" :key="town.name" class="lb-chip" type="button" :aria-pressed="model === `town:${town.name}`" @click="model = `town:${town.name}`">{{ town.name }}</button>
      <p v-if="!towns.length" class="lb-meta">No matching towns.</p>
    </div>
  </div>
</template>

<style scoped>
.location-filter { display: grid; gap: 12px; min-width: 0; }
.location-filter__regions { display: flex; flex-wrap: wrap; gap: 8px; border: 0; padding: 0; margin: 0; }
.location-filter legend, .location-filter label { font-size: var(--text-sm); font-weight: 650; }
.location-filter legend { float: none; margin-bottom: 8px; }
.location-filter input { width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid var(--hairline-strong); border-radius: 12px; background: var(--paper-white); color: var(--ink); font: inherit; }
.location-filter input:focus-visible { outline: 3px solid var(--sunny-ring); outline-offset: 2px; }
.location-filter__towns { display: flex; flex-wrap: wrap; gap: 8px; max-height: 220px; overflow-y: auto; padding: 3px; }
.location-filter p { margin: 0; }
</style>
