<script setup lang="ts">
import { usePanelFocusFlag } from '@web/modules/map-shell/panel-focus'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { usePanelScrollReset } from '@web/modules/map-shell/use-panel-scroll'
import { onMounted, ref, useId, useSlots } from 'vue'
import { type RouteLocationRaw, RouterLink } from 'vue-router'

// The frame every panel fills: optional back link, the panel's h1, a scrolling body and an
// optional sticky action bar. `scrollKey` lists whatever changes the content (tab, step, sort,
// filters); when it changes the body jumps back to the top.
const props = withDefaults(
  defineProps<{
    title: string
    back?: RouteLocationRaw | null
    backLabel?: string
    hideTitle?: boolean
    scrollKey?: string
  }>(),
  { back: null, backLabel: 'Back', hideTitle: false, scrollKey: '' },
)
defineSlots<{ default(): unknown; actions?(): unknown; heading?(): unknown }>()

const slots = useSlots()
const headingId = useId()
const body = ref<HTMLElement | null>(null)
const heading = ref<HTMLElement | null>(null)
const focusOnMount = usePanelFocusFlag()

usePanelScrollReset(body, [() => props.scrollKey])

onMounted(() => {
  if (!focusOnMount.value) return
  heading.value?.focus({ preventScroll: true })
  // Once per navigation: a panel swapping loading for loaded content must not steal focus.
  focusOnMount.value = false
})
</script>

<template>
  <section class="panel-frame" :aria-labelledby="headingId">
    <div ref="body" class="panel-frame__body" data-testid="panel-body">
      <RouterLink v-if="back" :to="back" class="panel-frame__back">
        <ShellIcon name="back" :size="16" />{{ backLabel }}
      </RouterLink>
      <div class="panel-frame__heading">
        <h1
          :id="headingId"
          ref="heading"
          tabindex="-1"
          class="panel-frame__title lb-display"
          :class="{ 'visually-hidden': hideTitle }"
          data-panel-heading
        >
          {{ title }}
        </h1>
        <slot name="heading" />
      </div>
      <slot />
    </div>
    <div v-if="slots.actions" class="panel-frame__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.panel-frame {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* The only thing that scrolls. Bottom padding clears the part of a bottom sheet that sits
   below the screen edge (--sheet-offset), so the last item is always reachable. */
.panel-frame__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  padding: var(--space-5) 22px calc(var(--space-6) + var(--sheet-offset, 0px));
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Content keeps its height and the body scrolls. Without this, a child that is itself a
   scroll container (a tab strip) would shrink to fit and be painted over. */
.panel-frame__body > :deep(*) {
  flex-shrink: 0;
}

.panel-frame__back {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  min-height: var(--hit);
  margin: calc(var(--space-3) * -1) 0 calc(var(--space-2) * -1);
  font: 700 0.8125rem/1 var(--font-sans);
  color: var(--ink-muted);
  text-decoration: none;
}

.panel-frame__back:hover {
  color: var(--ink);
}

.panel-frame__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  min-width: 0;
}

.panel-frame__heading:not(:has(> :not(.visually-hidden))) {
  display: contents;
}

.panel-frame__title {
  min-width: 0;
  margin: 0;
  font-size: 1.625rem;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.panel-frame__title:focus {
  outline: none;
}

.panel-frame__title:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 4px;
  border-radius: 4px;
}

/* Sticky action bar. In a bottom sheet it rises with the visible part of the sheet. */
.panel-frame__actions {
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: var(--space-3) 22px max(var(--space-3), env(safe-area-inset-bottom));
  background: var(--paper-white);
  border-top: 1px solid var(--hairline);
  transform: translateY(calc(-1 * var(--sheet-offset, 0px)));
}
</style>
