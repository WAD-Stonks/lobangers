<script setup lang="ts">
import { deriveCommunityStatus, sampleReports, statusTone } from '@web/modules/landing/community-freshness'
import { computed } from 'vue'

const props = defineProps<{ progress: number; complete: boolean }>()
const arrived = computed(() => Math.min(sampleReports.length, Math.floor(props.progress * sampleReports.length + 0.001)))
const evidence = computed(() => deriveCommunityStatus(sampleReports.slice(0, arrived.value)))
</script>

<template>
  <div class="community-pulse" :class="`tone-${statusTone(evidence.status)}`">
    <span class="community-pulse-label">COMMUNITY PULSE</span>
    <div class="pulse-ring" role="img" :aria-label="`${arrived} of 5 sample observations considered; ${evidence.recent} within the fictional last 24 hours. ${evidence.status}.`">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="51" fill="none" stroke="#dcdcc8" stroke-width="7" /><circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" pathLength="1" :stroke-dasharray="`${progress} 1`" transform="rotate(-90 60 60)" /><circle cx="60" cy="60" :r="45 + Math.sin(progress * Math.PI * 5) * 9" fill="none" stroke="currentColor" :opacity="progress > 0 && progress < 1 ? .2 : 0" /></svg>
      <div><b>{{ evidence.recent }}</b><span>recent sample<br />{{ evidence.recent === 1 ? 'report' : 'reports' }}</span></div>
    </div>
    <strong>{{ evidence.status }}</strong>
    <p>{{ complete ? '3 recent · 2 older reports excluded' : `${arrived} of 5 sample observations` }}</p>
  </div>
</template>
