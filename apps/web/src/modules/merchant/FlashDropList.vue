<script setup lang="ts">
import type { FlashDropDisplayStatus, MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import FakeBadge from '@web/modules/merchant/FakeBadge.vue'
import {
  flashOfferText,
  moneyText,
  STATUS_LABELS,
  statusSentence,
  summaryLine,
} from '@web/modules/merchant/flash-drop-rules'

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
const badgeClass: Record<FlashDropDisplayStatus, string> = {
  DRAFT: 'badge-draft',
  SCHEDULED: 'badge-approved',
  LIVE: 'badge-live',
  ENDED: 'text-bg-secondary',
  STOPPED: 'badge-back',
}

const showsProgress = (drop: MerchantFlashDrop) => drop.status === 'LIVE' || drop.status === 'ENDED'
const claimedPercent = (drop: MerchantFlashDrop) =>
  Math.round((drop.claimedCount / drop.codeLimit) * 100)
</script>

<template>
  <p v-if="drops.length === 0" class="text-secondary small mb-2">{{ empty }}</p>
  <ul v-else class="list-unstyled d-grid gap-3 mb-2">
    <li
      v-for="drop in drops"
      :key="drop.id"
      class="card card-body drop-card"
      :class="{ 'bg-body-tertiary': drop.status === 'ENDED' || drop.status === 'STOPPED' }"
      :data-testid="`flash-drop-${drop.id}`"
    >
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="d-flex flex-wrap align-items-center gap-2 title-row">
          <h4 class="h5 mb-0 title">{{ drop.dealTitle }}</h4>
          <FakeBadge v-if="drop.demo" />
        </div>
        <span class="badge" :class="badgeClass[drop.status]">{{ STATUS_LABELS[drop.status] }}</span>
      </div>
      <p class="mb-1 mt-2">
        <strong>Flash offer: {{ flashOfferText(drop) || 'Other (see the title)' }}</strong>
        <span v-if="drop.offerType === 'FIXED_PRICE' && drop.usualPriceCents" class="text-secondary">
          (usually {{ moneyText(drop.usualPriceCents) }})</span
        >
      </p>
      <p class="small text-secondary mb-1">{{ summaryLine(drop, now) }}</p>
      <p class="small mb-2">{{ statusSentence(drop, now) }}</p>

      <template v-if="showsProgress(drop)">
        <div
          class="progress mb-1"
          role="progressbar"
          :aria-label="`Codes claimed for ${drop.dealTitle}`"
          :aria-valuenow="drop.claimedCount"
          aria-valuemin="0"
          :aria-valuemax="drop.codeLimit"
        >
          <div class="progress-bar claimed" :style="{ width: `${claimedPercent(drop)}%` }"></div>
        </div>
        <p class="small text-secondary mb-2">
          <strong class="text-body">{{ drop.claimedCount }}</strong> of {{ drop.codeLimit }} claimed
        </p>
      </template>

      <p v-if="drop.status === 'STOPPED' && drop.reviewNote" class="alert alert-danger small mb-2">
        LoBangers: “{{ drop.reviewNote }}”
      </p>

      <div class="d-flex flex-wrap gap-2 mt-1">
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
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* A coral edge marks flash deals apart from ordinary deals. */
.drop-card {
  border-left: 4px solid var(--coral);
}
/* Long deal titles wrap beside the status badge instead of pushing it off the card. */
.title-row {
  min-width: 0;
}
.title {
  overflow-wrap: anywhere;
  text-wrap: balance;
}
.badge-draft {
  --draft-bg: #e6ddff;
  --draft-ink: #3d2a85;
  background: var(--draft-bg);
  color: var(--draft-ink);
}
.app-palette[data-theme='dark'] .badge-draft {
  --draft-bg: #2e2650;
  --draft-ink: #c9bcff;
}
.badge-approved {
  background: var(--ink-strong);
  color: var(--on-ink);
}
.badge-live {
  background: var(--coral);
  color: var(--paper-white);
}
.badge-back {
  background: var(--tag-end-bg);
  color: var(--tag-end-ink);
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
