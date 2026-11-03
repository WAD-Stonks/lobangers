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
  busyId: string | null // the flash deal with a request in progress
  now: Date
  empty: string // what to say when the list is empty
}>()

const emit = defineEmits<{
  edit: [drop: MerchantFlashDrop]
  goLive: [drop: MerchantFlashDrop]
  remove: [drop: MerchantFlashDrop] // delete a draft, or a past flash deal from the history
  end: [drop: MerchantFlashDrop]
}>()

// Badge colours for each status.
const TONES: Record<FlashDropDisplayStatus, CardTone> = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  ENDED: 'ended',
  STOPPED: 'removed',
}

// The flash offer, with the usual price it beats for a fixed price: "$1.50 (usually $4.00)".
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
            class="progress"
            role="progressbar"
            :aria-label="`Codes claimed for ${drop.dealTitle}`"
            :aria-valuenow="drop.claimedCount"
            aria-valuemin="0"
            :aria-valuemax="drop.codeLimit"
          >
            <div class="progress-bar claimed" :style="{ width: `${claimedPercent(drop)}%` }"></div>
          </div>
          <p class="flash-extra">
            <strong class="text-body">{{ drop.claimedCount }}</strong> of {{ drop.codeLimit }} claimed
          </p>
        </template>

        <p v-if="drop.status === 'STOPPED' && drop.reviewNote" class="alert alert-danger small mb-0 p-2">
          LoBangers: “{{ drop.reviewNote }}”
        </p>

        <template #actions>
          <template v-if="drop.status === 'DRAFT'">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="busyId === drop.id"
              @click="emit('goLive', drop)"
            >
              Go live<span class="visually-hidden">: {{ drop.dealTitle }}</span>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary"
              :disabled="busyId === drop.id"
              @click="emit('edit', drop)"
            >
              Edit<span class="visually-hidden"> {{ drop.dealTitle }}</span>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              :disabled="busyId === drop.id"
              @click="emit('remove', drop)"
            >
              Delete draft<span class="visually-hidden">: {{ drop.dealTitle }}</span>
            </button>
          </template>
          <button
            v-if="drop.status === 'SCHEDULED' || drop.status === 'LIVE'"
            type="button"
            class="btn btn-sm btn-outline-danger"
            :disabled="busyId === drop.id"
            @click="emit('end', drop)"
          >
            End now<span class="visually-hidden">: {{ drop.dealTitle }}</span>
          </button>
          <button
            v-if="drop.status === 'ENDED' || drop.status === 'STOPPED'"
            type="button"
            class="btn btn-sm btn-outline-danger"
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
/* Smaller details under the location: reach, status and codes claimed. */
.flash-extra {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.8rem;
}
.progress {
  height: 8px;
  background: var(--paper-sunk);
}
.claimed {
  background: var(--coral);
}
/* Comfortable touch targets on phones. */
@media (max-width: 575.98px) {
  .btn-sm {
    min-height: var(--hit);
  }
}
</style>
