<script setup lang="ts">
import type { AdminFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { DECISION_COPY, type DecisionKind } from '@web/modules/admin-flash-drops/flash-drop-format'
import { type DecisionProblem, NOTE_LIMIT } from '@web/modules/admin-flash-drops/use-admin-flash-drops'
import { computed } from 'vue'

const props = defineProps<{
  drop: AdminFlashDrop
  choices: readonly DecisionKind[]
  active: DecisionKind
  noteRequired: boolean
  pending: boolean
  canSubmit: boolean
  problem: DecisionProblem | null
}>()
const note = defineModel<string>('note', { required: true })
const confirmed = defineModel<boolean>('confirmed', { required: true })
const emit = defineEmits<{ choose: [kind: DecisionKind]; submit: []; refresh: [] }>()
const copy = computed(() => DECISION_COPY[props.active])
// Removing is the only action, and it cannot be undone.
const submitClass = 'btn-stop'
const noteId = computed(() => `flash-note-${props.drop.id}`)
const remaining = computed(() => NOTE_LIMIT - note.value.trim().length)
</script>

<template>
  <form class="fd-decision-form" novalidate @submit.prevent="emit('submit')">
    <fieldset class="fd-decision" :disabled="pending">
      <legend>Decision</legend>
      <div class="fd-choices">
        <button v-for="kind in choices" :key="kind" type="button" class="btn btn-outline-secondary" :aria-pressed="kind === active" @click="emit('choose', kind)">{{ DECISION_COPY[kind].choice }}</button>
      </div>
      <div class="fd-field">
        <label :for="noteId">{{ copy.noteLabel }}</label>
        <textarea :id="noteId" v-model="note" name="note" class="form-control" rows="3" :maxlength="NOTE_LIMIT" :placeholder="copy.placeholder" :required="noteRequired" :aria-describedby="`${noteId}-count`" />
        <span :id="`${noteId}-count`" class="fd-count">{{ remaining }} characters left</span>
      </div>
      <label class="fd-confirm"><input v-model="confirmed" name="confirm" type="checkbox" /> <span>I confirm {{ copy.verb }} {{ drop.dealTitle }} for {{ drop.merchantName }}.</span></label>
      <div v-if="problem" class="fd-alert" role="alert">
        <p>{{ problem.text }}</p>
        <button v-if="problem.kind === 'stale'" type="button" class="btn btn-outline-secondary" @click="emit('refresh')">Refresh</button>
      </div>
      <div class="fd-submit-row">
        <button type="submit" class="btn" :class="submitClass" data-testid="flash-decision-submit" :disabled="!canSubmit">{{ pending ? 'Saving…' : copy.submit }}</button>
        <span>The merchant sees the outcome and your note. It is also logged in Audit.</span>
      </div>
    </fieldset>
  </form>
</template>
