<script setup lang="ts">
import { useOpenRoomCode } from '@web/modules/squad/open-room-code'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// The way into Makan Squad from the map header: "Room" starts one, and while the visitor is in
// an open room it reads "Room KOPI" and takes them back to it. Compact (with a bottom nav, where
// it takes the menu button's place) it is a round icon, plus the code while in a room.
defineProps<{ compact?: boolean }>()
const openCode = useOpenRoomCode()
const to = computed(() =>
  openCode.value ? { name: 'squad-room', params: { code: openCode.value } } : { name: 'squad-new' },
)
const label = computed(() => (openCode.value ? `Back to Squad room ${openCode.value}` : 'Start a Squad room'))
</script>

<template>
  <RouterLink class="squad-nav lb-card" :class="{ 'is-in': openCode, 'squad-nav--compact': compact }" :to="to" :aria-label="label" data-testid="squad-header-button">
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 11h16a8 8 0 0 1-16 0Z" />
      <path d="M2 11h20" />
      <path d="M14 7l4-4" />
    </svg>
    <span v-if="!compact">Room</span><span v-if="openCode" class="squad-nav__code" translate="no">{{ openCode }}</span>
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
  color: var(--on-accent);
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
  color: var(--on-accent);
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
  color: var(--on-ink);
  background: var(--ink-strong);
  border-color: var(--ink-strong);
}

.squad-nav.is-in:hover {
  background: var(--ink-strong-hover);
}

/* At night the room is charcoal, not inverted, so the chip matches it and the code stays sunny. */
.app-palette[data-theme='dark'] .squad-nav.is-in {
  color: var(--ink);
  background: var(--paper-sunk);
  border-color: var(--hairline-strong);
}

.app-palette[data-theme='dark'] .squad-nav.is-in:hover {
  background: var(--paper-hover);
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

/* Round like the header's other buttons; it grows into a pill only to show a room code. */
.squad-nav--compact {
  justify-content: center;
  min-width: var(--hit);
  height: var(--hit);
  padding: 0 11px;
}

.squad-nav--compact.is-in {
  padding: 0 14px 0 12px;
}

@media (prefers-reduced-motion: reduce) {
  .squad-nav:active {
    transform: none;
  }
}
</style>
