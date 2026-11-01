<script setup lang="ts">
import type { FlashDropDisplayStatus, MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'
import FakeBadge from '@web/modules/merchant/FakeBadge.vue'
import {
  moneyText,
  STATUS_LABELS,
  statusSentence,
  summaryLine,
} from '@web/modules/merchant/flash-drop-rules'

defineProps<{
  drops: MerchantFlashDrop[]
  sample: boolean // sample data: show the demo-only buttons
  busyId: string | null // the drop with a request in progress
  now: Date
}>()

const emit = defineEmits<{
  end: [drop: MerchantFlashDrop]
  resend: [drop: MerchantFlashDrop]
  approve: [drop: MerchantFlashDrop] // demo only
  start: [drop: MerchantFlashDrop] // demo only
}>()

// Badge colours for each status.
const badgeClass: Record<FlashDropDisplayStatus, string> = {
  IN_REVIEW: 'badge-review',
  SCHEDULED: 'badge-approved',
  LIVE: 'badge-live',
  ENDED: 'text-bg-secondary',
  SENT_BACK: 'badge-back',
  STOPPED: 'badge-back',
}

const showsProgress = (drop: MerchantFlashDrop) => drop.status === 'LIVE' || drop.status === 'ENDED'
const claimedPercent = (drop: MerchantFlashDrop) =>
  Math.round((drop.claimedCount / drop.codeLimit) * 100)
</script>

<template>
  <p v-if="drops.length === 0" class="text-secondary">No flash drops yet.</p>
  <ul v-else class="list-unstyled d-grid gap-3 mb-4">
    <li
      v-for="drop in drops"
      :key="drop.id"
      class="card card-body drop-card"
      :class="{ 'bg-body-tertiary': drop.status === 'ENDED' || drop.status === 'STOPPED' }"
      :data-testid="`flash-drop-${drop.id}`"
    >
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="d-flex flex-wrap align-items-center gap-2 title-row">
          <h3 class="h5 mb-0 title">{{ drop.dealTitle }}</h3>
          <FakeBadge v-if="drop.demo || sample" />
        </div>
        <span class="badge" :class="badgeClass[drop.status]">{{ STATUS_LABELS[drop.status] }}</span>
      </div>
      <p class="mb-1 mt-2">
        <strong>Flash price {{ moneyText(drop.flashPriceCents) }}</strong>
        <span v-if="drop.usualPriceCents" class="text-secondary">
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

      <p
        v-if="(drop.status === 'SENT_BACK' || drop.status === 'STOPPED') && drop.reviewNote"
        class="alert alert-danger small mb-2"
      >
        LoBangers: “{{ drop.reviewNote }}”
      </p>

      <div class="d-flex flex-wrap gap-2 mt-1">
        <template v-if="drop.status === 'IN_REVIEW'">
          <button
            v-if="sample"
            type="button"
            class="btn btn-sm btn-outline-secondary demo"
            :disabled="busyId === drop.id"
            @click="emit('approve', drop)"
          >
            Simulate approval (demo)
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-danger"
            :disabled="busyId === drop.id"
            @click="emit('end', drop)"
          >
            Withdraw
          </button>
        </template>
        <button
          v-if="sample && drop.status === 'SCHEDULED'"
          type="button"
          class="btn btn-sm btn-outline-secondary demo"
          :disabled="busyId === drop.id"
          @click="emit('start', drop)"
        >
          Skip to start time (demo)
        </button>
        <button
          v-if="drop.status === 'SCHEDULED' || drop.status === 'LIVE'"
          type="button"
          class="btn btn-sm btn-outline-danger"
          :disabled="busyId === drop.id"
          @click="emit('end', drop)"
        >
          End drop early
        </button>
        <button
          v-if="drop.status === 'SENT_BACK'"
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busyId === drop.id"
          @click="emit('resend', drop)"
        >
          Edit and resend
        </button>
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* A coral edge marks flash drops apart from ordinary deals. */
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
.badge-review {
  background: #e6ddff;
  color: #3d2a85;
}
.badge-approved {
  background: var(--ink-strong);
  color: var(--paper-white);
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
/* Demo-only buttons look like a note, not a real action. */
.demo {
  border-style: dashed;
}
/* Comfortable touch targets on phones. */
@media (max-width: 575.98px) {
  .btn-sm {
    min-height: var(--hit);
  }
}
</style>
