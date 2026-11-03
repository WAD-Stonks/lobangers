<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ step: number; noDeals: boolean }>()
const emit = defineEmits<{ close: []; next: []; back: []; addDeal: [] }>()
const steps = [
  { title: 'Find a deal that fits', body: 'Use Price, Cuisine, Deal type and Expiry to narrow your search. Quick filters sit above the map; Filters opens all options. Apply your choices with Show deals.', target: '[data-testid="filter-sheet"]' },
  { title: 'Open a deal', body: 'Choose a map pin or a result to see the full poster, offer, outlet and dates. Check the terms before heading out. Save keeps it in your saved deals; directions opens your route.', target: '.deal-panel__media, [data-testid="shell-panel"] [data-panel-heading]' },
  { title: 'Check community verification', body: 'Recent Still on and Gone reports help show whether an offer is likely to be available. Check the report dates and terms. Community reports are helpful context, not a guarantee; sign in to contribute your own report.', target: '.deal-community-verification, [data-testid="deal-community"]' },
  { title: 'Read the conversation', body: 'Comments can add tips, restrictions and recent experiences. Read them without an account, or sign in to add your own experience. View all comments opens the full discussion when more comments are available.', target: '.deal-community-discussion, [data-testid="deal-community"]' },
  { title: 'Where to add a deal', body: 'The Share shortcut and Add a deal menu button lead to the contribution page. Sign in, add the offer details and a photo, then submit it for admin review before it appears on the map.', target: '[data-testid="map-share"], [data-testid="nav-toggle"]' },
] as const
const current = computed(() => steps[props.step] ?? steps[0])
const card = ref<HTMLElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)
const bounds = ref<{ left: number; top: number; width: number; height: number } | null>(null)
const cardAtTop = computed(() => window.innerWidth < 768 && bounds.value !== null && bounds.value.top + bounds.value.height / 2 > window.innerHeight / 2)
let observer: MutationObserver | null = null
let frame: number | null = null
let lastTarget: HTMLElement | null = null

const locate = (scroll = false) => {
  const selector = props.noDeals && props.step > 0 && props.step < 4 ? '[data-testid="shell-panel"]' : current.value.target
  // Prefer the specific feature over its fallback container.
  const candidates = selector.split(',').flatMap((part) => [...document.querySelectorAll<HTMLElement>(part.trim())])
  const target = candidates.find((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
  })
  if (!target) { bounds.value = null; return }
  if (scroll || target !== lastTarget) target.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' })
  lastTarget = target
  const rect = target.getBoundingClientRect()
  const left = Math.max(8, rect.left - 6)
  const top = Math.max(8, rect.top - 6)
  const right = Math.min(window.innerWidth - 8, rect.right + 6)
  const bottom = Math.min(window.innerHeight - 8, rect.bottom + 6)
  bounds.value = right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
}
// Body-wide mutations and scrolls arrive in bursts; measure at most once per frame, and never
// push the pending frame back (a steady stream of mutations would otherwise starve it).
const refresh = () => {
  if (typeof requestAnimationFrame !== 'function') { locate(); return }
  if (frame !== null) return
  frame = requestAnimationFrame(() => { frame = null; locate() })
}
const spotlightStyle = computed(() => bounds.value ? {
  left: `${bounds.value.left}px`, top: `${bounds.value.top}px`,
  width: `${bounds.value.width}px`, height: `${bounds.value.height}px`,
} : undefined)
watch(() => props.step, async () => {
  await nextTick()
  locate(true)
  nextButton.value?.focus()
})
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (event.key !== 'Tab') return
  const buttons = [...(card.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter((button) => !button.disabled)
  const first = buttons[0]
  const last = buttons.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(async () => {
  await nextTick()
  locate(true)
  nextButton.value?.focus()
  observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', refresh)
  document.addEventListener('scroll', refresh, true)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame !== null) cancelAnimationFrame(frame)
  window.removeEventListener('resize', refresh)
  document.removeEventListener('scroll', refresh, true)
})
</script>

<template>
  <div class="map-tutorial" data-testid="map-tutorial">
    <div v-if="bounds" class="map-tutorial__spotlight" :style="spotlightStyle" aria-hidden="true" />
    <div v-else class="map-tutorial__scrim" aria-hidden="true" />
    <section ref="card" class="map-tutorial__card lb-card" :class="{ 'map-tutorial__card--top': cardAtTop }" role="dialog" aria-modal="true" aria-labelledby="map-tutorial-title" aria-describedby="map-tutorial-body" @keydown="onKeydown">
      <header><span class="map-tutorial__progress" aria-live="polite">Map guide · {{ step + 1 }} of {{ steps.length }}</span><button type="button" class="lb-ctrl lb-ctrl--flat" aria-label="Close map tutorial" @click="emit('close')"><ShellIcon name="close" :size="18" /></button></header>
      <h2 id="map-tutorial-title">{{ current.title }}</h2>
      <p id="map-tutorial-body">{{ current.body }}</p>
      <p v-if="noDeals && step > 0 && step < 4" class="map-tutorial__empty">There are no current matching deals to demonstrate. These features appear when you open a deal.</p>
      <footer>
        <button class="lb-btn lb-btn--ghost" type="button" :disabled="step === 0" @click="emit('back')">Back</button>
        <button v-if="step === steps.length - 1" class="lb-btn" type="button" @click="emit('addDeal')">Add a deal</button>
        <button ref="nextButton" class="lb-btn lb-btn--primary" type="button" data-testid="tutorial-next" @click="step === steps.length - 1 ? emit('close') : emit('next')">{{ step === steps.length - 1 ? 'Finish' : 'Next' }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.map-tutorial { position: fixed; inset: 0; z-index: 90; }
.map-tutorial__spotlight { position: fixed; border: 3px solid var(--sunny); border-radius: 18px; box-shadow: 0 0 0 9999px rgb(20 22 20 / 0.6); pointer-events: none; }
.map-tutorial__scrim { position: absolute; inset: 0; background: rgb(20 22 20 / 0.6); }
.map-tutorial__card { position: absolute; right: calc(20px + env(safe-area-inset-right, 0px)); bottom: calc(20px + env(safe-area-inset-bottom, 0px)); width: min(380px, calc(100vw - 32px)); max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); padding: 20px; overflow-y: auto; overscroll-behavior: contain; background: var(--paper-white); border-radius: 24px; box-shadow: 0 20px 70px rgb(0 0 0 / 0.25); }
.map-tutorial__card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.map-tutorial__progress { color: var(--coral-deep); font-size: 0.8rem; font-weight: 750; }
.map-tutorial__card h2 { margin: 8px 0 12px; font-size: 1.4rem; font-weight: 750; line-height: 1.2; }
.map-tutorial__card p { font-size: 0.9rem; line-height: 1.6; margin-bottom: 14px; }
.map-tutorial__empty { padding: 10px 12px; background: var(--paper-sunk); border-radius: 12px; }
.map-tutorial__card footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.map-tutorial__card footer button:first-child { margin-right: auto; }
.map-tutorial__card footer button:disabled { cursor: default; }
@media (max-width: 767.98px) {
  .map-tutorial__card { right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); padding: 16px; }
  .map-tutorial__card--top { top: calc(16px + env(safe-area-inset-top, 0px)); bottom: auto; }
}
</style>
