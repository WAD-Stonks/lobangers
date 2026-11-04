<script setup lang="ts">
import type { CatalogueMerchant } from '@broke-oclock/contracts/admin-catalogue'
import { computed, ref } from 'vue'

const props = defineProps<{ merchant?: CatalogueMerchant; disabled: boolean }>()
const emit = defineEmits<{
  save: [body: { name: string; note: string; confirmed: boolean }]
  cancel: []
}>()
const name = ref(props.merchant?.name ?? '')
const note = ref('')
const confirmed = ref(false)
// The reason and confirmation sit with the field: renaming a merchant is always deliberate.
const changed = computed(() => {
  const next = name.value.trim()
  return next !== '' && next !== (props.merchant?.name ?? '')
})
</script>

<template>
  <section class="catalogue-editor">
    <h3>{{ merchant ? 'Edit name' : 'Merchant name' }}</h3>
    <p class="catalogue-editor-intro">
      <template v-if="merchant">Fix spelling or formatting only. No merging, rebranding or reparenting.</template>
      <template v-else>Add the merchant first. You can add its outlets right after.</template>
    </p>
    <form @submit.prevent="emit('save', { name, note, confirmed })">
      <fieldset :disabled="disabled">
        <label class="form-label" for="merchant-name">Merchant name</label>
        <input id="merchant-name" v-model="name" name="merchantName" class="form-control" maxlength="160" autocomplete="off" required />
        <div class="catalogue-decision">
          <p v-if="changed && merchant" class="catalogue-consequence">“{{ merchant.name }}” becomes “{{ name.trim() }}” on {{ merchant.venueCount }} outlets and {{ merchant.dealCount }} deals.</p>
          <p v-else-if="changed" class="catalogue-consequence">Creates “{{ name.trim() }}” with no outlets yet.</p>
          <label class="form-label" for="merchant-note">Reason</label>
          <textarea id="merchant-note" v-model="note" name="note" class="form-control" maxlength="500" rows="2" required />
          <label class="form-check mt-3"><input v-model="confirmed" name="confirmed" type="checkbox" class="form-check-input" required /><span class="form-check-label">{{ merchant ? `I checked this is still the same business as ${merchant.name}, not a rebrand` : 'I checked this merchant is not already in the list' }}</span></label>
        </div>
      </fieldset>
      <!-- Outside the fieldset so a locked form can still be closed. -->
      <div class="catalogue-form-actions">
        <button class="btn btn-primary" type="submit" :disabled="disabled || !changed">{{ merchant ? 'Save name' : 'Create merchant' }}</button>
        <button class="btn btn-outline-secondary" type="button" @click="emit('cancel')">Cancel</button>
      </div>
    </form>
  </section>
</template>

<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
