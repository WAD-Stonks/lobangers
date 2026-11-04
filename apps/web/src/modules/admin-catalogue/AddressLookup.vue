<script setup lang="ts">
import type { IngestionLocationsResponse } from '@broke-oclock/contracts/ingestion'
import { api } from '@web/lib/api-client'
import { ref } from 'vue'

export type AddressCandidate = IngestionLocationsResponse['items'][number]
defineProps<{ disabled: boolean }>()
const emit = defineEmits<{
  pick: [candidate: AddressCandidate]
  denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN']
}>()
const query = ref('')
const items = ref<AddressCandidate[] | null>(null)
const searching = ref(false)
const problem = ref('')
const picked = ref<number | null>(null)
let ticket = 0
const search = async () => {
  const value = query.value.trim()
  if (searching.value || value.length < 2) return
  const current = ++ticket
  searching.value = true
  problem.value = ''
  items.value = null
  picked.value = null
  try {
    const result = await api.ingestion.searchLocations({ query: value })
    if (current === ticket) items.value = result.items.slice(0, 8)
  } catch (error) {
    if (current !== ticket) return
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    problem.value =
      code === 'PRECONDITION_FAILED'
        ? 'OneMap isn’t set up on this server. Enter the address below.'
        : 'OneMap didn’t respond. Try again, or enter the address below.'
  } finally {
    if (current === ticket) searching.value = false
  }
}
const pick = (candidate: AddressCandidate, index: number) => {
  picked.value = index
  emit('pick', candidate)
}
</script>

<template>
  <section class="catalogue-lookup" aria-labelledby="address-lookup-title">
    <h4 id="address-lookup-title">Find the address</h4>
    <form class="catalogue-lookup-form" @submit.prevent="search">
      <label for="address-lookup" class="visually-hidden">Postal code or building</label>
      <input id="address-lookup" v-model="query" type="search" class="form-control" maxlength="120" autocomplete="off" placeholder="Postal code or building" :disabled="disabled" />
      <button type="submit" class="btn btn-outline-primary" :disabled="disabled || searching || query.trim().length < 2">{{ searching ? 'Searching…' : 'Search OneMap' }}</button>
    </form>
    <p v-if="problem" role="alert" class="catalogue-muted">{{ problem }}</p>
    <p v-else-if="items && !items.length" role="status" class="catalogue-muted">No matches. Try the postal code, or enter the address below.</p>
    <ul v-else-if="items" class="catalogue-candidates">
      <li v-for="(candidate, index) in items" :key="index">
        <button type="button" class="catalogue-candidate" :aria-pressed="picked === index" :disabled="disabled" @click="pick(candidate, index)">
          <strong class="catalogue-candidate-title">{{ candidate.searchValue.toLowerCase() }}</strong>
          <span class="catalogue-muted">{{ candidate.address }}</span>
        </button>
      </li>
    </ul>
    <p class="catalogue-muted catalogue-lookup-credit">Address data from OneMap, used under the <a href="https://www.onemap.gov.sg/legal/opendatalicence.html" target="_blank" rel="noopener noreferrer">Singapore Open Data Licence</a>. Picking a match fills the form. Check it before saving.</p>
  </section>
</template>

<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
