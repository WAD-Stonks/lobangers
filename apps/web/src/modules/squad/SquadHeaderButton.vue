<script setup lang="ts">
import { useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// The way into Makan Squad from the map header: "Room" starts one, and while the visitor is in
// an open room it reads "Room KOPI" and takes them back to it.
const room = useSquadRoom()

const openCode = computed(() => {
  const state = room?.state.value
  if (!state || state.status === 'CLOSED' || state.me?.left || state.me?.kicked) return null
  return state.code
})
const to = computed(() =>
  openCode.value ? { name: 'squad-room', params: { code: openCode.value } } : { name: 'squad-new' },
)
const label = computed(() => (openCode.value ? `Back to Squad room ${openCode.value}` : 'Start a Squad room'))
</script>

<template>
  <RouterLink class="squad-nav lb-card" :class="{ 'is-in': openCode }" :to="to" :aria-label="label" data-testid="squad-header-button">
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 11h16a8 8 0 0 1-16 0Z" />
      <path d="M2 11h20" />
      <path d="M14 7l4-4" />
    </svg>
    <span>Room</span><span v-if="openCode" class="squad-nav__code" translate="no">{{ openCode }}</span>
  </RouterLink>
</template>

<style scoped>
.squad-nav {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  height: var(--control-h);
  padding: 0 16px 0 14px;
  font: 700 0.9375rem/1 var(--font-sans);
  color: var(--ink);
  white-space: nowrap;
  text-decoration: none;
  background: var(--sunny);
  border: 1px solid var(--sunny-deep);
  border-radius: var(--radius-pill);
  transition:
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease;
}

.squad-nav:hover {
  color: var(--ink);
  background: var(--sunny-deep);
}

.squad-nav:active {
  transform: scale(0.97);
}

.squad-nav:focus-visible {
  outline: 3px solid var(--sky);
  outline-offset: 2px;
}

/* In a room: dark like the room itself, with the code in sunny. */
.squad-nav.is-in {
  color: var(--paper-white);
  background: var(--ink-strong);
  border-color: var(--ink-strong);
}

.squad-nav.is-in:hover {
  background: var(--ink-strong-hover);
}

.squad-nav__code {
  font-family: var(--font-display);
  letter-spacing: 0.04em;
  color: var(--sunny);
}

/* Narrow phones: tighter padding so the search keeps room to type. */
@media (max-width: 399.98px) {
  .squad-nav {
    gap: 4px;
    padding: 0 12px 0 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .squad-nav:active {
    transform: none;
  }
}
</style>
