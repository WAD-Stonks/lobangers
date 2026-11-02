<script setup lang="ts">
import '@web/modules/admin-flash-drops/admin-flash-drop-detail.css'
import type { AdminFlashDrop } from '@broke-oclock/contracts/flash-drops'
import {
  CHECK_MARKS,
  checkRows,
  durationMinutes,
  formatDistance,
  offerLine,
  outcomeLine,
  statusLabel,
  statusTone,
  windowLine,
} from '@web/modules/admin-flash-drops/flash-drop-format'
import { computed } from 'vue'

const props = defineProps<{ drop: AdminFlashDrop }>()
const checks = computed(() => checkRows(props.drop))
const outcome = computed(() => outcomeLine(props.drop))
const claimedShare = computed(() =>
  Math.min(100, Math.round((props.drop.claimedCount / props.drop.codeLimit) * 100)),
)
const codesLine = computed(() =>
  ['LIVE', 'ENDED', 'STOPPED'].includes(props.drop.status)
    ? `${props.drop.codeLimit} codes · ${props.drop.claimedCount} claimed`
    : `${props.drop.codeLimit} codes`,
)
const coordinates = computed(
  () => `${props.drop.outletLat.toFixed(5)}, ${props.drop.outletLng.toFixed(5)}`,
)
</script>

<template>
  <article class="fd-detail" :aria-labelledby="`flash-drop-title-${drop.id}`">
    <header class="fd-detail-head">
      <div>
        <p class="fd-eyebrow">Flash drop · {{ drop.merchantName }}</p>
        <h3 :id="`flash-drop-title-${drop.id}`">{{ drop.dealTitle }}<span v-if="drop.demo" class="fd-fake">Fake deal</span></h3>
      </div>
      <span class="fd-status" :data-tone="statusTone(drop.status)">{{ statusLabel(drop.status) }}</span>
    </header>
    <dl class="fd-facts">
      <dt>Offer</dt><dd>{{ offerLine(drop) }}</dd>
      <dt>Window (SGT)</dt><dd>{{ windowLine(drop) }} · {{ durationMinutes(drop) }} min</dd>
      <dt>Banner radius</dt><dd>{{ formatDistance(drop.radiusMetres) }} around the outlet</dd>
      <dt>Codes</dt><dd>{{ codesLine }}</dd>
      <dt>Outlet</dt><dd>{{ drop.outletName }} · {{ coordinates }}</dd>
      <template v-if="drop.reviewNote && !outcome"><dt>Last note</dt><dd>“{{ drop.reviewNote }}”</dd></template>
    </dl>
    <section aria-label="Checks">
      <ul class="fd-checks">
        <li v-for="check in checks" :key="check.key" :data-check="check.key">
          <span class="fd-check-mark" :data-tone="check.tone" :aria-label="CHECK_MARKS[check.tone].label" role="img">{{ CHECK_MARKS[check.tone].mark }}</span>
          <div>
            <span>{{ check.text }}</span>
            <ul v-if="check.details?.length"><li v-for="detail in check.details" :key="detail">{{ detail }}</li></ul>
          </div>
        </li>
      </ul>
    </section>
    <section v-if="drop.status === 'LIVE'" aria-label="Live now">
      <ul class="fd-live">
        <li><b>{{ drop.claimedCount }}/{{ drop.codeLimit }}</b>codes claimed<div class="fd-bar" aria-hidden="true"><span :style="{ width: `${claimedShare}%` }" /></div></li>
        <li><b>{{ Math.max(0, drop.codeLimit - drop.claimedCount) }}</b>codes left</li>
        <li><b>{{ claimedShare }}%</b>of the drop used</li>
      </ul>
    </section>
    <p v-if="outcome" class="fd-outcome" :data-tone="drop.status === 'ENDED' ? 'neutral' : 'bad'">{{ outcome }}</p>
    <slot />
  </article>
</template>
