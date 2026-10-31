<script setup lang="ts">
import { reportAge, sampleReports } from '@web/modules/landing/community-freshness'
import { segment } from '@web/modules/landing/use-story-progress'
import { computed } from 'vue'

const props = defineProps<{
  progress: number
  pulse: number
  width: number
  height: number
  stallBottom: number
  stallX: number
  stallY: number
  stallSize: number
  pulseX: number
  pulseY: number
  reduced: boolean
}>()
const mobile = computed(() => props.width <= 1100)
const reports = computed(() => mobile.value && !props.reduced ? sampleReports.slice(0, 3) : sampleReports)
const orbitStyle = computed(() => ({
  opacity: segment(props.progress, .34, .48) * (1 - .35 * segment(props.progress, .85, 1)),
  transform: `rotate(${ -22 + segment(props.progress, .38, .7) * 38 }deg)`,
  transformOrigin: `${props.stallX}px ${props.stallY}px`,
}))
const anchor = (index: number) => ({
  x: mobile.value ? props.width / 2 : props.width * ([props.width <= 1400 ? .39 : .38, .92, props.width <= 1400 ? .39 : .38, .92, .92][index] ?? .5),
  y: mobile.value ? props.stallBottom + 16 + index * 66 : props.height * ([.25, .25, .61, .61, .83][index] ?? .5),
})
const signal = (index: number) => {
  const t = segment(props.pulse, index * .13, index * .13 + .35)
  const a = anchor(index)
  const startY = a.y + (mobile.value ? 22 : 0)
  return {
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * props.width * .5 + t ** 2 * props.pulseX,
    y: (1 - t) ** 2 * startY + 2 * (1 - t) * t * props.height * .22 + t ** 2 * props.pulseY,
    opacity: segment(props.pulse, index * .13, index * .13 + .08) * (1 - segment(props.pulse, index * .13 + .28, index * .13 + .38)),
  }
}
const position = (index: number) => {
  if (props.reduced) return {}
  const enter = segment(props.progress, 0.35 + index * 0.026, 0.44 + index * 0.026)
  const orbit = segment(props.progress, 0.44 + index * 0.018, 0.58 + index * 0.018)
  const wave = Math.sin(orbit * Math.PI)
  const { x, y } = anchor(index)
  return {
    left: `${x + (index % 2 ? -1 : 1) * ((1 - enter) * 45 + wave * 20)}px`,
    top: `${y - wave * (mobile.value ? 10 : 28)}px`,
    opacity: enter * (mobile.value ? 1 - segment(props.progress, .82, .95) : 1),
    transform: `translate(-50%, ${mobile.value ? 0 : '-50%'}) rotate(${(1 - orbit) * (index % 2 ? 3 : -3)}deg) scale(${.78 + enter * .22})`,
  }
}
</script>

<template>
  <section class="community-orbit" aria-label="Fictional community observations" :aria-hidden="!reduced && progress < 0.36">
    <svg v-if="!reduced && !mobile" class="community-orbit-tracks" :viewBox="`0 0 ${width} ${height}`" :style="orbitStyle" aria-hidden="true" focusable="false">
      <ellipse :cx="stallX" :cy="stallY" :rx="stallSize * .57" :ry="stallSize * .43" />
      <ellipse :cx="stallX" :cy="stallY" :rx="stallSize * .52" :ry="stallSize * .39" />
    </svg>
    <article v-for="(report, index) in reports" :key="report.id" class="community-report" :class="[`report-${report.kind}`, { 'report-old': index > 2 }]" :style="position(index)">
      <span class="report-symbol" aria-hidden="true">{{ report.kind === 'alive' ? '✓' : report.kind === 'ended' ? '×' : '!' }}</span>
      <div><small>SAMPLE · {{ reportAge(report) }}</small><p>{{ report.message }}</p><span v-if="index > 2" class="report-age-note">Older than 24h · excluded</span></div>
    </article>
    <p v-if="mobile && !reduced" class="mobile-older-reports" :style="{ top: `${stallBottom + 16 + 3 * 66}px`, opacity: progress >= .7 ? 1 - segment(progress, .82, .95) : 0 }">2 older sample reports excluded · check dates &amp; terms.</p>
    <svg v-if="!reduced" class="community-signals" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true" focusable="false">
      <g v-for="(report, index) in reports" :key="report.id" :opacity="signal(index).opacity">
        <circle :cx="signal(index).x" :cy="signal(index).y" r="10" fill="#fffdf6" :stroke="report.kind === 'alive' ? '#366341' : '#a33e2a'" stroke-width="2" />
        <text :x="signal(index).x" :y="signal(index).y + 4" text-anchor="middle" font-size="12" font-weight="800" :fill="report.kind === 'alive' ? '#366341' : '#a33e2a'">{{ report.kind === 'alive' ? '✓' : report.kind === 'ended' ? '×' : '!' }}</text>
      </g>
    </svg>
  </section>
</template>
