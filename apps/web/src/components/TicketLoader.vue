<script setup lang="ts">
import { TICKET_ICON_PATHS } from '@web/components/ticket-icon'
</script>

<template>
  <span class="ticket-loader" data-testid="ticket-loader">
    <svg
      class="ticket-loader__ticket"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-for="d in TICKET_ICON_PATHS" :key="d" :d="d" />
    </svg>
    <span class="ticket-loader__shadow" />
  </span>
</template>

<style scoped>
/* A ticket tumbling down the street: hop, quarter-turn, land, rest. Four tumbles make one full
   turn, then a longer pause before the next run so the rhythm goes bum... bum... bum... bumm. */
.ticket-loader {
  --ticket-size: 2.5rem;
  --ticket-hop: -0.9rem;
  --ticket-cycle: 3.2s;
  position: relative;
  display: inline-grid;
  justify-items: center;
  width: var(--ticket-size);
  padding-bottom: 0.6rem;
}

.ticket-loader__ticket {
  display: block;
  width: var(--ticket-size);
  height: var(--ticket-size);
  animation: ticket-tumble var(--ticket-cycle) infinite;
}

.ticket-loader__shadow {
  display: block;
  width: calc(var(--ticket-size) * 0.9);
  height: 0.35rem;
  margin-top: 0.15rem;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.22;
  animation: ticket-shadow var(--ticket-cycle) infinite;
}

/* Each tumble: 0.45s in the air (rise ease-out, fall ease-in), then rest on the new edge. */
@keyframes ticket-tumble {
  0%, 21.9% { transform: translateY(0) rotate(0deg); animation-timing-function: ease-out; }
  7% { transform: translateY(var(--ticket-hop)) rotate(45deg); animation-timing-function: ease-in; }
  14% { transform: translateY(0) rotate(90deg); }
  21.9% { transform: translateY(0) rotate(90deg); animation-timing-function: ease-out; }
  28.9% { transform: translateY(var(--ticket-hop)) rotate(135deg); animation-timing-function: ease-in; }
  35.9%, 43.75% { transform: translateY(0) rotate(180deg); animation-timing-function: ease-out; }
  50.75% { transform: translateY(var(--ticket-hop)) rotate(225deg); animation-timing-function: ease-in; }
  57.75%, 65.6% { transform: translateY(0) rotate(270deg); animation-timing-function: ease-out; }
  72.6% { transform: translateY(var(--ticket-hop)) rotate(315deg); animation-timing-function: ease-in; }
  79.6%, 100% { transform: translateY(0) rotate(360deg); }
}

/* The shadow shrinks while the ticket is airborne and spreads on each landing. */
@keyframes ticket-shadow {
  0%, 14%, 21.9%, 35.9%, 43.75%, 57.75%, 65.6%, 79.6%, 100% { transform: scaleX(1); opacity: 0.22; }
  7%, 28.9%, 50.75%, 72.6% { transform: scaleX(0.55); opacity: 0.1; }
  15.5%, 37.4%, 59.25%, 81.1% { transform: scaleX(1.15); opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
  .ticket-loader__ticket,
  .ticket-loader__shadow {
    animation: none;
  }
}
</style>
