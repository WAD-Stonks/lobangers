<script setup lang="ts">
import TicketLoader from '@web/components/TicketLoader.vue'

defineProps<{ label: string }>()
</script>

<template>
  <div class="ticket-loading" role="status" data-testid="ticket-loading">
    <TicketLoader class="ticket-loading__ticket" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
/* The splash screen's tumbling ticket with a caption, centred in whatever space a page has while
   it fetches. Matches the map shell's panel loading state. */
.ticket-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  font: 600 0.9375rem/1.4 var(--font-sans);
  color: var(--ink-muted);
}

.ticket-loading__ticket { color: var(--sunny-deep); }
</style>
