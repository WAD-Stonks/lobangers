<script setup lang="ts" generic="T extends string | number">
// A row of pill-shaped radio buttons, e.g. 15 min / 30 min / 60 min.
// They are real radio inputs, so the keyboard and screen readers treat them as one choice.
withDefaults(
  defineProps<{
    name: string // groups the radios; also used to build each input's id
    legend: string
    choices: { value: T; label: string }[]
    invalid?: boolean // marks the group for an error shown by the parent
    describedby?: string // id of that error
  }>(),
  { invalid: false, describedby: undefined },
)

const model = defineModel<T>({ required: true })
</script>

<template>
  <fieldset class="mb-3" :aria-describedby="describedby">
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
          :aria-invalid="invalid ? 'true' : undefined"
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
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
  touch-action: manipulation;
}
@media (pointer: coarse) {
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
  }
}
/* The chosen chip is dark, like the app's other selected pills. */
.btn-check:checked + .chip {
  background: var(--ink-strong);
  border-color: var(--ink-strong);
  color: var(--on-ink);
}
</style>
