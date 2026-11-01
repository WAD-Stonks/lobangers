<script setup lang="ts" generic="T extends string | number">
// A row of pill-shaped radio buttons, e.g. 15 min / 30 min / 60 min.
// They are real radio inputs, so the keyboard and screen readers treat them as one choice.
defineProps<{
  name: string // groups the radios; also used to build each input's id
  legend: string
  choices: { value: T; label: string }[]
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <fieldset class="mb-3">
    <legend class="form-label fs-6 mb-2">{{ legend }}</legend>
    <div class="d-flex flex-wrap gap-2">
      <template v-for="choice in choices" :key="choice.value">
        <input
          :id="`${name}-${choice.value}`"
          v-model="model"
          type="radio"
          class="btn-check"
          :name="name"
          :value="choice.value"
        />
        <label :for="`${name}-${choice.value}`" class="btn btn-outline-secondary chip">
          {{ choice.label }}
        </label>
      </template>
    </div>
  </fieldset>
</template>

<style scoped>
.chip {
  min-width: 4.5rem;
  touch-action: manipulation;
}
/* The chosen chip is dark, like the app's other selected pills. */
.btn-check:checked + .chip {
  background: var(--ink-strong);
  border-color: var(--ink-strong);
  color: var(--paper-white);
}
</style>
