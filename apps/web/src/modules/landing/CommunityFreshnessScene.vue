<script setup lang="ts">
import CommunityOrbit from '@web/modules/landing/CommunityOrbit.vue'
import CommunityPulse from '@web/modules/landing/CommunityPulse.vue'
import { communityTimeline, deriveCommunityStatus, hawkerLayout, sampleReports, statusTone } from '@web/modules/landing/community-freshness'
import { money, type SampleDeal } from '@web/modules/landing/deals'
import HawkerStallModel from '@web/modules/landing/HawkerStallModel.vue'
import { hawkerPhotoAnchor } from '@web/modules/landing/hawker-projection'
import JoinCommunityCTA from '@web/modules/landing/JoinCommunityCTA.vue'
import { clamp, segment } from '@web/modules/landing/use-story-progress'
import { computed, ref } from 'vue'

const props = defineProps<{
  deal: SampleDeal
  area: string
  storyProgress: number
  offer: number
  reduced: boolean
  viewport: { width: number; height: number }
}>()
const modelReady = ref(false)
const anchors = ref({sign:{x:.5,y:.18},status:{x:.74,y:.69}})
const progress = computed(() => props.reduced ? 1 : clamp((props.storyProgress - 0.78) / 0.22))
const motion = computed(() => communityTimeline(progress.value, props.reduced))
const layout = computed(() => hawkerLayout(props.viewport.width, props.viewport.height, motion.value.cta))
const evidence = deriveCommunityStatus(sampleReports)
const statusTarget = computed(() => ({
  x: layout.value.x + (anchors.value.status.x - .5) * layout.value.size,
  y: layout.value.top + anchors.value.status.y * layout.value.height,
}))
const statusStyle = computed(() => props.reduced ? {} : ({
  left: `${statusTarget.value.x}px`,
  top: `${statusTarget.value.y}px`,
  width: `${Math.max(160, Math.min(230, layout.value.size * .27))}px`,
  opacity: motion.value.food,
  '--status-glow': `${Math.sin(motion.value.flip * Math.PI) * 16}px`,
  transform: `translate(-50%, -50%) perspective(700px) rotateX(${motion.value.flip * 180}deg)`,
}))
const chapters = [
  { label: 'THE STALL COMES ALIVE', title: 'Your own', accent: 'hawker stall.', copy: 'See how a discovered deal becomes a local find.' },
  { label: 'THE COMMUNITY ORBIT', title: 'The word', accent: 'on the street.', copy: 'Recent visits add context to each deal.' },
  { label: 'STATUS REVEAL', title: 'Keep deals', accent: 'in the loop.', copy: 'Check recent votes, dates and terms.' },
] as const
const chapterIndex = computed(() => props.reduced ? 2 : progress.value < .35 ? 0 : progress.value < .7 ? 1 : 2)
const chapter = computed(() => chapters[chapterIndex.value])
const introStyle = computed(() => ({
  opacity: props.reduced ? 1 : segment(progress.value, .1, .22) * ((layout.value.mobile || props.viewport.height <= 850) ? 1 - motion.value.cta : 1),
}))
const cardStyle = computed(() => {
  if (props.reduced) return { '--stall': 1, opacity: 1 }
  const { width: w, height: h } = props.viewport
  const g = layout.value
  const sourceMobile = w <= 800
  const travel = motion.value.handoff
  const sourceWidth = Math.min(sourceMobile ? w * .84 : w * .34, 420)
  const sourceX = sourceMobile ? w * .5 : w * .075 + sourceWidth / 2
  const sourceY = h * (sourceMobile ? .77 : .67)
  return {
    opacity: props.offer * (modelReady.value ? 1 - segment(travel, .72, 1) : 1),
    left: `${sourceX + (g.x - sourceX) * travel}px`,
    top: `${sourceY + (g.top + anchors.value.sign.y * g.height - sourceY) * travel}px`,
    width: `${sourceWidth + (g.signWidth - sourceWidth) * travel}px`,
    transform: `translate(-50%, -50%) rotate(${(1 - travel) * -2}deg)`,
    '--stall': travel,
  }
})
const photoStyle = computed(() => {
  if (props.reduced) return {}
  const { width: w, height: h } = props.viewport
  const g = layout.value
  const sourceMobile = w <= 800
  const t = motion.value.handoff
  const sourceSize = sourceMobile ? Math.min(w * (w <= 350 ? .52 : .48), 300) : Math.min(w * .4, 610)
  const sourceX = sourceMobile ? w * .5 : w * .95 - sourceSize / 2
  const sourceY = h * (sourceMobile ? .07 : .15) + sourceSize / 2
  return {
    opacity: props.offer * (1 - segment(t, .45, .95)),
    left: `${sourceX + (g.x + (hawkerPhotoAnchor.x - 220) / 440 * g.size - sourceX) * t + (1 - props.offer) * 60}px`,
    top: `${sourceY + (g.foodY - sourceY) * t}px`,
    width: `${sourceSize + (g.size * (g.mobile ? .16 : .13) - sourceSize) * t}px`,
    transform: `translate(-50%, -50%) skewY(${t * 2.23}deg) rotate(${-8 * (1 - t)}deg)`,
    aspectRatio: `${1 + t / 3}`,
    borderRadius: `${50 * (1 - t) + 3 * t}%`,
    borderWidth: `${(sourceMobile ? 10 : 18) * (1 - t) + t * 4}px`,
  }
})
const stallStyle = computed(() => props.reduced ? {} : ({
  left: `${layout.value.x}px`, top: `${layout.value.top}px`, width: `${layout.value.size}px`,
  transform: 'translateX(-50%)',
}))
const pulseTarget = computed(() => ({
  x: props.viewport.width * (layout.value.mobile ? (props.viewport.width <= 600 ? .14 : .84) : .18),
  y: layout.value.mobile ? layout.value.top + layout.value.height - 105 : props.viewport.height * (props.viewport.height <= 850 ? .68 : props.viewport.width <= 1400 ? .55 : .53) - 35,
}))
const pulseStyle = computed(() => props.reduced ? {} : ({
  left: `${pulseTarget.value.x}px`,
  top: `${props.viewport.width <= 600 ? layout.value.top + layout.value.height - 85 : pulseTarget.value.y - (layout.value.mobile ? 54 : 78)}px`,
  opacity: segment(progress.value, .51, .58),
}))
const statusVisible = computed(() => props.reduced || motion.value.flip >= .5)
</script>

<template>
  <div :aria-hidden="!reduced && offer < .1" class="community-freshness" :class="{ 'model-ready': modelReady, 'is-static': reduced, 'has-community': progress > .1, 'has-cta': motion.cta > .9 }" :data-community-progress="progress" :data-deal-id="deal.id">
    <div class="hawker-environment" :style="{ opacity: motion.handoff }" aria-hidden="true"><span class="hawker-floor" /><span class="hawker-sun" /></div>
    <header class="community-intro" :style="introStyle" :aria-hidden="!reduced && (progress < .12 || ((layout.mobile || viewport.height <= 850) && motion.cta > .9))">
      <span class="community-eyebrow">Example walkthrough · sample data</span>
      <h2>{{ chapter.title }}{{ reduced ? ' ' : '' }}<br /><em>{{ chapter.accent }}</em></h2>
      <p>{{ chapter.copy }}</p>
      <div class="community-chapter-dots" aria-hidden="true"><span v-for="(_, index) in chapters" :key="index" :class="{ active: index === chapterIndex }" /></div>
    </header>
    <div class="compact-stall-summary" :style="{opacity: motion.food}" :aria-hidden="!reduced && motion.food < .9"><strong>{{ deal.restaurant }} · {{ money(deal.price) }}</strong><span>{{ area }} · Illustrative offer</span></div>
    <div class="hawker-stage" :style="stallStyle">
      <HawkerStallModel :motion="motion" :deal="deal" :area="area" :active="offer > .05 || reduced" :reduced="reduced" @ready="modelReady = $event" @anchors="anchors = $event" />
    </div>
    <article class="travelling-deal shared-deal-sign" :style="cardStyle" :aria-hidden="!reduced && (offer < .1 || (modelReady && motion.handoff >= 1))" :data-deal-id="deal.id">
      <div class="travelling-content">
        <small class="sample-label">{{ motion.handoff > .6 ? 'LOBANGERS · SAMPLE STALL' : 'ILLUSTRATIVE FOOD DEAL' }}</small>
        <h3>{{ deal.restaurant }}</h3>
        <p class="shared-deal-location">⌖ {{ area }} · {{ deal.cuisine }}</p>
        <strong>{{ deal.title }}</strong>
        <div class="travelling-price"><b>{{ money(deal.price) }}</b><del>{{ money(deal.original) }}</del><span>{{ deal.badge }}</span></div>
      </div>
    </article>
    <div class="community-food-display" :style="photoStyle" :aria-hidden="reduced || offer < .1 || motion.handoff > .95"><img class="community-food-photo" :src="deal.image" :alt="`${deal.restaurant} illustrative deal photograph in a counter-mounted display`" loading="lazy" width="640" height="480" /></div>
    <div class="community-status-panel" :style="statusStyle" aria-hidden="true">
      <div class="status-panel-front"><span>COMMUNITY REPORTS</span><strong>Checking the latest…</strong></div>
      <div class="status-panel-back" :class="`tone-${statusTone(evidence.status)}`"><strong>✓ {{ evidence.status }}</strong><small>Sample reports · not a guarantee</small></div>
    </div>
    <p class="visually-hidden">{{ deal.restaurant }} · {{ area }} · {{ deal.title }} · {{ money(deal.price) }}. Sample offer.</p>
    <p class="visually-hidden">{{ statusVisible ? `Illustrative community-reported status: ${evidence.status}. Latest sample report: 18 minutes ago. Not a guarantee of availability.` : 'Checking community reports.' }}</p>
    <CommunityOrbit :progress="progress" :pulse="motion.pulse" :width="viewport.width" :height="viewport.height" :stall-bottom="layout.top + layout.height" :stall-x="layout.x" :stall-y="layout.top + layout.height * .5" :stall-size="layout.size" :pulse-x="statusTarget.x" :pulse-y="statusTarget.y" :reduced="reduced" />
    <div class="community-pulse-position" :style="pulseStyle" :aria-hidden="!reduced && progress < .52">
      <CommunityPulse :progress="motion.pulse" :complete="motion.pulse === 1" />
    </div>
    <div class="community-join-position" :style="{ opacity: motion.cta }">
      <JoinCommunityCTA :progress="motion.cta" :reduced="reduced" />
    </div>
  </div>
</template>
