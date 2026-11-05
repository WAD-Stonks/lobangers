<script setup lang="ts">
import { ref, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    count: number
    level?: 'h2' | 'h3'
    defaultOpen?: boolean
  }>(),
  { level: 'h2', defaultOpen: true },
)

const open = ref(props.defaultOpen)
const panelId = useId()
</script>

<template>
  <section class="deal-section" :class="`deal-section--${level}`">
    <component :is="level" class="deal-section__heading">
      <button
        type="button"
        class="deal-section__toggle"
        :aria-expanded="open"
        :aria-controls="panelId"
        @click="open = !open"
      >
        <span class="deal-section__chevron" aria-hidden="true" />
        <span class="deal-section__title">{{ title }}</span>
        <span class="deal-section__count">{{ count }}</span>
      </button>
    </component>
    <div v-show="open" :id="panelId" class="deal-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.deal-section {
  margin-bottom: 16px;
}

.deal-section--h2 {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card);
  background: var(--paper-white);
}

.deal-section--h2 > .deal-section__body {
  padding: 0 16px 8px;
}

.deal-section--h3 {
  margin-bottom: 8px;
}

.deal-section__heading {
  margin: 0;
}

.deal-section__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: var(--hit);
  padding: 12px 16px;
  border: 0;
  border-radius: var(--radius-card);
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.deal-section--h3 .deal-section__toggle {
  padding: 8px 4px;
  border-radius: var(--radius-control);
}

.deal-section__toggle:hover {
  background: var(--paper-hover);
}

.deal-section__toggle:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.deal-section__title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.deal-section--h2 .deal-section__title {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
}

.deal-section--h3 .deal-section__title {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.deal-section__count {
  min-width: 2rem;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--paper-sunk);
  color: var(--ink-muted);
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.deal-section__chevron {
  width: 0.55rem;
  height: 0.55rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 150ms ease;
}

.deal-section__toggle[aria-expanded='true'] .deal-section__chevron {
  transform: rotate(45deg);
}

@media (prefers-reduced-motion: reduce) {
  .deal-section__chevron {
    transition: none;
  }
}
</style>
