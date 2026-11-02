<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// On a deal's page: a dark card, the room's own look, that starts a Squad room with this deal
// already picked. Hidden when the deal was opened from inside a room.
const props = defineProps<{ dealId: string }>()
const route = useRoute()
const fromRoom = computed(() => route.query.from === 'squad')
const to = computed(() => ({ name: 'squad-new', query: { deal: props.dealId } }))
</script>

<template>
  <RouterLink v-if="!fromRoom" class="squad-cta" :to="to" data-testid="squad-deal-cta">
    <span class="squad-cta__pot" aria-hidden="true">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 11h16a8 8 0 0 1-16 0Z" />
        <path d="M2 11h20" />
        <path d="M14 7l4-4" />
      </svg>
    </span>
    <span class="squad-cta__text">
      <strong>Can't decide with friends?</strong>
      <span>Start a Squad room with this deal</span>
    </span>
    <ShellIcon name="chevronRight" :size="18" class="squad-cta__chev" />
  </RouterLink>
</template>

<style scoped>
.squad-cta {
  /* Dark like the Squad room. --ink-strong turns light at night, so dark mode pins a raised
     charcoal surface instead of an inverted card. */
  --cta-bg: var(--ink-strong);
  --cta-text: var(--on-ink);
  --cta-muted: #c9c6bf;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  min-height: 64px;
  padding: 12px 14px;
  color: var(--cta-text);
  text-decoration: none;
  background: var(--cta-bg);
  border-radius: 18px;
  transition:
    transform var(--dur-press) var(--ease-out),
    box-shadow 160ms ease;
}

.app-palette[data-theme='dark'] .squad-cta {
  --cta-bg: var(--paper-sunk);
  --cta-text: var(--ink);
  --cta-muted: var(--ink-muted);
}

.squad-cta:hover {
  color: var(--cta-text);
}

@media (hover: hover) and (pointer: fine) {
  .squad-cta:hover {
    box-shadow: 0 0 0 2px var(--sunny);
  }
}

.squad-cta:active {
  transform: scale(0.98);
}

.squad-cta:focus-visible {
  outline: 3px solid var(--sky);
  outline-offset: 2px;
}

.squad-cta__pot {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--on-accent);
  background: var(--sunny);
  border-radius: 12px;
}

.squad-cta__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.squad-cta__text strong {
  font-size: var(--text-sm);
}

.squad-cta__text span {
  font-size: var(--text-xs);
  color: var(--cta-muted);
}

.squad-cta__chev {
  color: var(--cta-muted);
}

@media (prefers-reduced-motion: reduce) {
  .squad-cta:active {
    transform: none;
  }
}
</style>
