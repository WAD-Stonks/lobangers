<script setup lang="ts">
import { ADD_DEAL_STEPS } from '@web/modules/add-deal/add-deal-steps'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'

// The numbered progress bar above the form. Steps already passed can be reopened; later ones
// open only through Next, which checks the current step first. `labels` renames the steps (the
// merchant dashboard's deal form calls its second step Outlets).
const props = withDefaults(
  defineProps<{ current: number; reached: number; labels?: readonly string[]; navLabel?: string }>(),
  { labels: () => ADD_DEAL_STEPS.map((step) => step.label), navLabel: 'Add a deal steps' },
)
const emit = defineEmits<{ go: [step: number] }>()
</script>

<template>
  <nav class="add-deal-stepper" :aria-label="navLabel">
    <ol class="add-deal-stepper__list" :style="{ '--progress': props.current / (ADD_DEAL_STEPS.length - 1) }">
      <li
        v-for="(step, index) in ADD_DEAL_STEPS"
        :key="step.id"
        class="add-deal-stepper__step"
        :class="{ 'is-current': index === current, 'is-done': index < current }"
      >
        <button
          type="button"
          class="add-deal-stepper__button"
          :aria-current="index === current ? 'step' : undefined"
          :disabled="index > reached || index === current"
          :data-testid="`step-${step.id}`"
          @click="emit('go', index)"
        >
          <span class="add-deal-stepper__dot" aria-hidden="true">
            <ShellIcon v-if="index < current" name="check" :size="18" :stroke-width="2.6" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="add-deal-stepper__label">
            <span class="visually-hidden">Step {{ index + 1 }}: </span>{{ labels[index] ?? step.label }}<span v-if="index < current" class="visually-hidden"> (done)</span>
          </span>
        </button>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.add-deal-stepper__list {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The track runs between the first and last dot; the filled part reaches the current one. */
.add-deal-stepper__list::before,
.add-deal-stepper__list::after {
  content: '';
  position: absolute;
  top: 22px;
  left: 12.5%;
  height: 3px;
  border-radius: 3px;
}
.add-deal-stepper__list::before {
  right: 12.5%;
  background: var(--hairline);
}
.add-deal-stepper__list::after {
  width: calc(75% * var(--progress));
  background: var(--sunny);
  transition: width 260ms var(--ease-out);
}

.add-deal-stepper__step {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.add-deal-stepper__button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 4px;
  color: var(--ink-muted);
  font: 600 0.9375rem / 1.25 var(--font-sans);
  background: none;
  border: 0;
  cursor: pointer;
}
.add-deal-stepper__button:disabled {
  cursor: default;
}

.add-deal-stepper__dot {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  color: var(--ink);
  font-size: 1.0625rem;
  font-weight: 750;
  background: var(--paper-white);
  border: 2px solid var(--hairline-strong, var(--hairline));
  border-radius: 50%;
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    transform 200ms var(--ease-out);
}

.is-current .add-deal-stepper__dot {
  color: var(--on-accent);
  background: var(--sunny);
  border-color: var(--sunny-deep);
  box-shadow: 0 0 0 6px var(--sunny-soft);
}
.is-done .add-deal-stepper__dot {
  color: var(--ink);
  /* Solid, so the track does not show through the tick. */
  background: color-mix(in srgb, var(--sunny) 35%, var(--paper-white));
  border-color: var(--sunny-deep);
}
.is-current .add-deal-stepper__button,
.is-done .add-deal-stepper__button {
  color: var(--ink);
}

.add-deal-stepper__label {
  overflow-wrap: anywhere;
  text-align: center;
}

@media (hover: hover) and (pointer: fine) {
  .add-deal-stepper__button:not(:disabled):hover .add-deal-stepper__dot {
    transform: scale(1.06);
  }
}

.add-deal-stepper__button:focus-visible {
  outline: none;
}
.add-deal-stepper__button:focus-visible .add-deal-stepper__dot {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 3px;
}

@media (max-width: 480px) {
  .add-deal-stepper__dot {
    width: 38px;
    height: 38px;
    font-size: 0.9375rem;
  }
  .add-deal-stepper__list::before,
  .add-deal-stepper__list::after {
    top: 18px;
  }
  .add-deal-stepper__button {
    font-size: 0.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .add-deal-stepper__list::after,
  .add-deal-stepper__dot {
    transition: none;
  }
}
</style>
