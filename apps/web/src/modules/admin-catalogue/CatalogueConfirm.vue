<script setup lang="ts">
import { ref } from 'vue'

// One reviewed, reasoned step for actions that are hard to undo: archiving and withdrawing proof.
const props = defineProps<{
  id: string
  title: string
  consequence: string
  confirmation: string
  action: string
  disabled: boolean
}>()
const emit = defineEmits<{ submit: [body: { note: string; confirmed: boolean }]; cancel: [] }>()
const note = ref('')
const confirmed = ref(false)
const submit = () => {
  if (props.disabled || !confirmed.value || !note.value.trim()) return
  emit('submit', { note: note.value, confirmed: confirmed.value })
}
</script>

<template>
  <section class="catalogue-confirm" :aria-labelledby="`${id}-title`">
    <form @submit.prevent="submit">
      <fieldset :disabled="disabled">
        <h4 :id="`${id}-title`">{{ title }}</h4>
        <p class="catalogue-consequence">{{ consequence }}</p>
        <label :for="`${id}-note`" class="form-label">Reason</label>
        <textarea :id="`${id}-note`" v-model="note" name="note" class="form-control" maxlength="500" rows="2" required />
        <label class="form-check mt-3"><input v-model="confirmed" name="confirmed" type="checkbox" class="form-check-input" required /><span class="form-check-label">{{ confirmation }}</span></label>
      </fieldset>
      <div class="catalogue-form-actions">
        <button class="btn btn-danger" type="submit" :disabled="disabled || !confirmed || !note.trim()">{{ action }}</button>
        <button class="btn btn-outline-secondary" type="button" @click="emit('cancel')">Cancel</button>
      </div>
    </form>
  </section>
</template>

<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
