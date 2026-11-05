<script setup lang="ts">
import type { FlashDropDisplayStatus, MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import FakeBadge from '@web/modules/merchant/FakeBadge.vue'
import {
  flashOfferText,
  flashReachText,
  flashWhenText,
  moneyText,
  STATUS_LABELS,
  statusSentence,
} from '@web/modules/merchant/flash-drop-rules'
import MerchantCardGrid from '@web/modules/merchant/MerchantCardGrid.vue'
import MerchantDealCard, { type CardTone } from '@web/modules/merchant/MerchantDealCard.vue'

defineProps<{
  drops: MerchantFlashDrop[]
  busyId: string | null
  now: Date
  empty: string
}>()

const emit = defineEmits<{
  edit: [drop: MerchantFlashDrop]
  goLive: [drop: MerchantFlashDrop]
  remove: [drop: MerchantFlashDrop]
  end: [drop: MerchantFlashDrop]
}>()

const TONES: Record<FlashDropDisplayStatus, CardTone> = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  ENDED: 'ended',
  STOPPED: 'removed',
}

const offerOf = (drop: MerchantFlashDrop) => {
  const offer = flashOfferText(drop) || 'Flash deal'
  return drop.offerType === 'FIXED_PRICE' && drop.usualPriceCents
    ? `${offer} (usually ${moneyText(drop.usualPriceCents)})`
    : offer
}

const showsProgress = (drop: MerchantFlashDrop) => drop.status === 'LIVE' || drop.status === 'ENDED'
const claimedPercent = (drop: MerchantFlashDrop) =>
  Math.round((drop.claimedCount / drop.codeLimit) * 100)
</script>

<template>
  <p v-if="drops.length === 0" class="text-secondary small mb-2">{{ empty }}</p>
  <MerchantCardGrid v-else>
    <li v-for="drop in drops" :key="drop.id" :data-testid="`flash-drop-${drop.id}`">
      <MerchantDealCard
        :title="drop.dealTitle"
        :description="drop.deal.description"
        :offer="offerOf(drop)"
        :dates="flashWhenText(drop, now)"
        :location="`At: ${drop.outletName}`"
        :terms="drop.deal.terms"
        :category="drop.deal.category"
        :photo-url="drop.deal.photo?.url ?? null"
        :badge="STATUS_LABELS[drop.status]"
        :tone="TONES[drop.status]"
      >
        <FakeBadge v-if="drop.demo" />
        <p class="flash-extra">{{ flashReachText(drop) }}</p>
        <p class="flash-extra">{{ statusSentence(drop, now) }}</p>

        <template v-if="showsProgress(drop)">
          <div
            class="claimed-track"
            role="progressbar"
            :aria-label="`Codes claimed for ${drop.dealTitle}`"
            :aria-valuenow="drop.claimedCount"
            aria-valuemin="0"
            :aria-valuemax="drop.codeLimit"
          >
            <div class="claimed-bar" :style="{ width: `${claimedPercent(drop)}%` }"></div>
          </div>
          <p class="flash-extra">
            <strong class="claimed-count">{{ drop.claimedCount }}</strong> of {{ drop.codeLimit }} claimed
          </p>
        </template>

        <p v-if="drop.status === 'STOPPED' && drop.reviewNote" class="merchant-alert merchant-alert--error flash-note">
          LoBangers: “{{ drop.reviewNote }}”
        </p>

        <template #actions>
          <template v-if="drop.status === 'DRAFT'">
            <button
              type="button"
              class="lb-btn lb-btn--primary merchant-btn--sm"
              :disabled="busyId === drop.id"
              @click="emit('goLive', drop)"
            >
              Go live<span class="visually-hidden">: {{ drop.dealTitle }}</span>
            </button>
            <button
              type="button"
              class="lb-btn merchant-btn--sm"
              :disabled="busyId === drop.id"
              @click="emit('edit', drop)"
            >
              Edit<span class="visually-hidden"> {{ drop.dealTitle }}</span>
            </button>
            <button
              type="button"
              class="lb-btn merchant-btn--sm merchant-btn--danger"
              :disabled="busyId === drop.id"
              @click="emit('remove', drop)"
            >
              Delete draft<span class="visually-hidden">: {{ drop.dealTitle }}</span>
            </button>
          </template>
          <button
            v-if="drop.status === 'SCHEDULED' || drop.status === 'LIVE'"
            type="button"
            class="lb-btn merchant-btn--sm merchant-btn--danger"
            :disabled="busyId === drop.id"
            @click="emit('end', drop)"
          >
            End now<span class="visually-hidden">: {{ drop.dealTitle }}</span>
          </button>
          <button
            v-if="drop.status === 'ENDED' || drop.status === 'STOPPED'"
            type="button"
            class="lb-btn merchant-btn--sm merchant-btn--danger"
            :disabled="busyId === drop.id"
            @click="emit('remove', drop)"
          >
            Delete<span class="visually-hidden">: {{ drop.dealTitle }}</span>
          </button>
        </template>
      </MerchantDealCard>
    </li>
  </MerchantCardGrid>
</template>

<style scoped>
.flash-extra {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.8rem;
}
.flash-empty {
  margin: 0;
  padding: 18px 20px;
  border: 1.5px dashed var(--track, var(--hairline));
  border-radius: 20px;
  color: var(--ink-muted);
  font-size: var(--text-sm);
}
.claimed-track {
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--paper-sunk);
}
.claimed-bar {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--coral);
}
.claimed-count {
  color: var(--ink);
}
.flash-note {
  padding: 8px 12px;
  font-size: 0.8rem;
}
</style>
