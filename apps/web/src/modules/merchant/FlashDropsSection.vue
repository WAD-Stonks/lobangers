<script setup lang="ts">
import TicketLoading from '@web/components/TicketLoading.vue'
import FlashDropList from '@web/modules/merchant/FlashDropList.vue'
import type { MerchantFlashDrop } from '@web/modules/merchant/flash-drop-api'
import type { MerchantFlashDrops } from '@web/modules/merchant/use-merchant-flash-drops'

// The dashboard's Flash deals tab: drafts, live and scheduled, and past flash deals, each under
// its own heading. The state lives in useMerchantFlashDrops (the page also shows it in the stats);
// Edit on a draft is passed up so the page can open its form.
defineProps<{ store: MerchantFlashDrops }>()
const emit = defineEmits<{ edit: [drop: MerchantFlashDrop] }>()
</script>

<template>
  <div class="flash-tab">
    <p class="flash-tab__intro">
      Short, limited-code deals that pop up on the map for people nearby.
      <span v-if="store.live.value" class="flash-tab__live" data-testid="flash-live-updates"><span class="flash-tab__dot" aria-hidden="true" />Live updates</span>
    </p>
    <p v-if="store.loadError.value" class="merchant-alert merchant-alert--error" role="alert">{{ store.loadError.value }}</p>

    <TicketLoading v-if="store.loading.value" label="Loading your flash deals…" />
    <template v-else>
      <section class="flash-tab__group" aria-labelledby="flash-drafts">
        <h3 id="flash-drafts" class="flash-tab__heading">Drafts <span class="flash-tab__count">{{ store.drafts.value.length }}</span></h3>
        <FlashDropList
          :drops="store.drafts.value"
          :busy-id="store.busyId.value"
          :now="store.now.value"
          empty="No drafts. Press “New flash deal” to make one."
          @edit="emit('edit', $event)"
          @go-live="store.goLive"
          @remove="store.remove"
        />
      </section>
      <section class="flash-tab__group" aria-labelledby="flash-running">
        <h3 id="flash-running" class="flash-tab__heading">Live and scheduled <span class="flash-tab__count">{{ store.running.value.length }}</span></h3>
        <FlashDropList
          :drops="store.running.value"
          :busy-id="store.busyId.value"
          :now="store.now.value"
          empty="Nothing live right now."
          @end="store.endNow"
        />
      </section>
      <section class="flash-tab__group" aria-labelledby="flash-past">
        <h3 id="flash-past" class="flash-tab__heading">Past <span class="flash-tab__count">{{ store.past.value.length }}</span></h3>
        <FlashDropList
          :drops="store.past.value"
          :busy-id="store.busyId.value"
          :now="store.now.value"
          empty="No past flash deals yet."
          @remove="store.remove"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.flash-tab {
  display: grid;
  gap: 28px;
}
.flash-tab__intro {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
  color: var(--ink-muted);
  font-size: var(--text-sm);
}
.flash-tab__group {
  display: grid;
  gap: 14px;
}
.flash-tab__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1.125rem;
  font-weight: 800;
}
.flash-tab__count {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--paper-sunk);
  color: var(--ink-muted);
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}
/* Shows claims are arriving live, not on a timer. */
.flash-tab__live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--ink);
}
.flash-tab__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coral);
  animation: live-pulse 1.6s ease-in-out infinite;
}
@keyframes live-pulse {
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .flash-tab__dot { animation: none; }
}
</style>
