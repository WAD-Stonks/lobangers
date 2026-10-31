<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { dealFreshness } from '@web/modules/browse-map/deal-format'
import { computed } from 'vue'

// Unverified is the usual state, so it is a quiet dotted ring rather than a word, named by an
// instant tooltip. The other statuses stay as readable tags because they ask for attention.
const UNVERIFIED_LABEL = 'Unverified'
const UNVERIFIED_HINT = 'Unverified: no recent community reports yet'

const props = defineProps<{ deal: Pick<DealPin, 'validUntil' | 'votes'>; paper?: boolean }>()
const freshness = computed(() => dealFreshness(props.deal))
</script>

<template>
  <span
    v-if="freshness.tone === 'new'"
    class="freshness-ring"
    :class="{ 'freshness-ring--paper': paper }"
    role="img"
    :aria-label="UNVERIFIED_HINT"
    :data-tip="UNVERIFIED_LABEL"
    data-testid="unverified-ring"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2.4" stroke-linecap="round" />
    </svg>
  </span>
  <span v-else class="lb-tag" :class="paper ? 'lb-tag--paper' : `lb-tag--${freshness.tone}`">{{ freshness.label }}</span>
</template>

<style scoped>
.freshness-ring {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--ink-muted);
  border-radius: var(--radius-pill);
}

.freshness-ring--paper {
  background: var(--paper-white);
}

/* Instant tooltip; the native title waits about a second and never shows on touch. */
.freshness-ring::after {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  z-index: 2;
  padding: 2px 8px;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.5;
  color: var(--paper-white);
  white-space: nowrap;
  pointer-events: none;
  content: attr(data-tip);
  background: var(--ink);
  border-radius: var(--radius-pill);
  opacity: 0;
  transform: translate(-50%, 2px);
  transition:
    opacity 120ms ease-out,
    transform 120ms ease-out;
}

.freshness-ring:hover::after,
:focus-visible > .freshness-ring::after,
.freshness-ring:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (prefers-reduced-motion: reduce) {
  .freshness-ring::after {
    transition: none;
  }
}
</style>
