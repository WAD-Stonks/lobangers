<script setup lang="ts">
import type { CatalogueMerchant } from '@broke-oclock/contracts/admin-catalogue'
import { ref } from 'vue'

const props = defineProps<{ merchant?: CatalogueMerchant; disabled: boolean }>()
const emit = defineEmits<{
  save: [body: { name: string; note: string; confirmed: boolean }]
  archive: [body: { note: string; confirmed: boolean }]
  addOutlet: []
}>()
const name = ref(props.merchant?.name ?? '')
const note = ref('')
const confirmed = ref(false)
</script>
<template>
  <section class="catalogue-editor">
    <h2>{{ merchant ? merchant.name : 'Create merchant' }}</h2>
    <p v-if="merchant" class="text-secondary">{{ merchant.id }} · version {{ merchant.version }} · {{ merchant.archived ? 'Archived — no restore' : 'Active' }}</p>
    <p>Name corrections only. No merging, rebranding or reparenting.</p>
    <p v-if="merchant" class="alert alert-warning">{{ merchant.venueCount }} outlets and {{ merchant.dealCount }} deals depend on this merchant. Archiving makes every outlet unavailable for new selection and public eligibility; it preserves all children, deals, grants, requests and evidence. No restore or grant reactivation.</p>
    <form @submit.prevent="emit('save', { name, note, confirmed })">
      <fieldset :disabled="disabled">
        <label class="form-label" for="merchant-name">Canonical merchant name</label>
        <input id="merchant-name" v-model="name" name="merchantName" class="form-control" maxlength="160" required />
        <label class="form-label mt-3" for="merchant-note">Reason for this operation</label>
        <textarea id="merchant-note" v-model="note" name="note" class="form-control" maxlength="500" required />
        <label class="form-check mt-3"><input v-model="confirmed" name="confirmed" type="checkbox" class="form-check-input" required /><span class="form-check-label">I confirm {{ merchant?.name ?? 'this new merchant' }} is the exact target and have reviewed the consequences. This is not rebranding.</span></label>
        <div class="d-flex gap-2 flex-wrap mt-3">
          <button class="btn btn-primary" type="submit">{{ merchant ? 'Save name correction' : 'Create merchant' }}</button>
          <button v-if="merchant" class="btn btn-outline-danger" type="button" :disabled="!confirmed || !note.trim()" @click="emit('archive', { note, confirmed })">Archive merchant</button>
          <button v-if="merchant" class="btn btn-outline-primary" type="button" @click="emit('addOutlet')">Add outlet to this merchant</button>
        </div>
      </fieldset>
    </form>
  </section>
</template>
