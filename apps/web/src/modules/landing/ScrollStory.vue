<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { distanceMetres } from '@web/modules/browse-map/distance'
import { isWithinSingapore } from '@web/modules/browse-map/singapore-bounds'
import { useGeolocation } from '@web/modules/browse-map/use-geolocation'
import CommunityFreshnessScene from '@web/modules/landing/CommunityFreshnessScene.vue'
import { regions, samples } from '@web/modules/landing/deals'
import FloatingSocialPost from '@web/modules/landing/FloatingSocialPost.vue'
import IllustratedMap from '@web/modules/landing/IllustratedMap.vue'
import NeighbourhoodDetail from '@web/modules/landing/NeighbourhoodDetail.vue'
import { storyChapter, storyTimeline } from '@web/modules/landing/story-timeline'
import { useStoryPlayback } from '@web/modules/landing/use-story-playback'
import { segment, useStoryProgress } from '@web/modules/landing/use-story-progress'
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{ liveDeals: DealPin[] }>()
const root = ref<HTMLElement | null>(null)
const { progress, reduced: systemReduced, viewport } = useStoryProgress(root)
const manualStill = ref(false)
const compactStill = computed(() => viewport.value.height < 700 || viewport.value.width < 360 || (viewport.value.width <= 1100 && viewport.value.height < 820))
const reduced = computed(() => systemReduced.value || manualStill.value || compactStill.value)
const { playing, play, stop } = useStoryPlayback(root, reduced)
const toggleStill = async () => {
  stop()
  manualStill.value = !manualStill.value
  await nextTick()
  root.value?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
}
const selected = ref(4)
const shuffled = ref(0)
const { status, position, locate } = useGeolocation()
const locationMessage = ref('Choose a neighbourhood to explore an illustrative food deal.')
const deal = computed(() => samples[selected.value] ?? samples[0])
const region = computed(() => regions[selected.value] ?? regions[0])
const motion = computed(() => storyTimeline(progress.value, reduced.value))
const chapter = computed(() => (reduced.value ? 3 : storyChapter(progress.value)))
const scenes = [
  {
    label: '01 / THE SCATTER',
    title: 'Lost in the feed.',
    description:
      'From Telegram chats to TikTok clips, Instagram posts and food blogs — great deals are scattered across different feeds.',
    hint: 'Drag a post. Let it drift. Then scroll to gather the lobangs. ↓',
  },
  {
    label: '02 / THE GATHER',
    title: 'Good lobangs. All together.',
    description:
      'Supported sources and community submissions bring food promotions into one place. Less scrolling. More discovering.',
    hint: 'Different feeds. One delicious map. ↓',
  },
  {
    label: '03 / ONE MAP',
    title: 'One island. Every lobang.',
    description:
      'The same map follows you. From scattered posts to a whole island of possibilities.',
    hint: 'Keep scrolling — your neighbourhood is next. ↓',
  },
  {
    label: '04 / THE NEIGHBOURHOOD',
    title: 'Dive into your neighbourhood.',
    description: 'Discover the best food deals closer to home.',
    hint: 'Pick your neighbourhood. Make it your map. ↓',
  },
  {
    label: '05 / THE SEARCH',
    title: 'Scanning for fresh lobangs.',
    description:
      'Looking around your chosen neighbourhood. This illustrative search locates a sample pin; it does not verify the offer.',
    hint: 'Watch the searchlight find your neighbourhood. ↓',
  },
  {
    label: '06 / THE DIVE',
    title: 'Follow the lobang.',
    description:
      'Zoom from the whole island into one nearby find. The location and sample offer follow your selection.',
    hint: 'One nearby pin. One delicious possibility. ↓',
  },
  {
    label: '07 / THE FIND',
    title: 'Close to home. Lobang found.',
    description: 'A tasty little find in your chosen neighbourhood.',
    hint: 'Found the deal? Next, check whether it is still on. ↓',
  },
  {
    label: '08 / THE LIVING HAWKER STALL',
    title: 'Found a lobang. Hear it from locals.',
    description:
      'Your nearby find becomes a miniature hawker stall. Recent community reports help you assess availability.',
    hint: 'Same deal. A little more local knowledge. ↓',
  },
  {
    label: '09 / THE COMMUNITY KEEPS IT FRESH',
    title: 'Good deals stay in the loop.',
    description:
      '“Still on” votes share recent sightings. “Gone” votes flag ended promotions. Together, community reports help keep deal status fresh before you make the trip.',
    hint: 'Members can vote. Join Lobangers to contribute your own reports.',
  },
] as const
const scene = computed(() => scenes[chapter.value] ?? scenes[0])
const controlsUsable = computed(
  () => reduced.value || (progress.value >= 0.425 && progress.value < 0.54),
)
const controlsVisible = computed(
  () => reduced.value || (progress.value >= 0.34 && progress.value < 0.54),
)
const nearbyLive = computed(() => {
  if (!position.value || !isWithinSingapore(position.value)) return null
  const origin = position.value
  return (
    props.liveDeals
      .flatMap((item) =>
        item.venues.map((venue) => ({
          deal: item,
          venue,
          distance: distanceMetres(origin, venue),
        })),
      )
      .sort((a, b) => a.distance - b.distance)[0] ?? null
  )
})
const geometry = computed(() => {
  const { width: w, height: h } = viewport.value
  const mobile = w <= 800
  const startWidth = w * (mobile ? 0.96 : 0.59)
  const fullWidth = Math.min(w * .96, (h - 160) * 1.5)
  const t = motion.value.handoff
  const width = startWidth + (fullWidth - startWidth) * t
  const startX = mobile ? w * 0.02 : w * 0.39
  const startY = mobile ? h * 0.51 : (h - startWidth / 1.5) * 0.5
  const fullY = mobile ? h * 0.4 : (h - fullWidth / 1.5) * 0.5
  const x = startX + ((w - fullWidth) / 2 - startX) * t
  const y = startY + (fullY - startY) * t + Math.sin(t * Math.PI) * (mobile ? 18 : 54)
  const targetX = w * (mobile ? 0.52 : 0.63)
  const targetY = h * (mobile ? (w <= 350 ? 0.62 : 0.6) : 0.52)
  return { w, h, mobile, width, height: width / 1.5, x, y, targetX, targetY }
})
const fieldStyle = computed(() => {
  const g = geometry.value
  if (reduced.value) return {}
  return { left: `${g.x}px`, top: `${g.y}px`, width: `${g.width}px`, height: `${g.height}px` }
})
const cameraStyle = computed(() => {
  const g = geometry.value
  const zoom = motion.value.zoom
  const x = g.x + (g.width * region.value.x) / 100
  const y = g.y + (g.height * region.value.y) / 100
  return {
    opacity: motion.value.collect * (1 - motion.value.portal),
    transform: reduced.value
      ? 'none'
      : `translate3d(${(g.targetX - x) * zoom}px, ${(g.targetY - y) * zoom}px, 0) scale(${1 + zoom * (g.mobile ? 1.9 : 3.3)}) rotate(${(1 - motion.value.collect) * -5}deg)`,
    transformOrigin: `${region.value.x}% ${region.value.y}%`,
  }
})
const copyStyle = computed(() => {
  const p = progress.value
  const alpha = reduced.value
    ? 1
    : p < 0.34
      ? 1 - segment(p, 0.25, 0.3)
      : p < 0.45
        ? segment(p, 0.34, 0.37)
        : p < 0.81
          ? 1 - segment(p, 0.65, 0.7)
          : segment(p, 0.81, 0.855)
  return { opacity: alpha, transform: `translateY(${(1 - alpha) * 22}px)` }
})
const entrance = (start: number, end: number, distance = 20) => {
  const value = reduced.value ? 1 : chapter.value === 3 ? segment(progress.value, start, end) : 1
  return { opacity: value, transform: `translateY(${distance * (1 - value)}px)` }
}
const portalStyle = computed(() => ({
  clipPath: `circle(${motion.value.portal * 152}% at ${geometry.value.mobile ? 52 : 63}% ${geometry.value.mobile ? 60 : 52}%)`,
  opacity: 1 - motion.value.transfer,
}))
const scanPosition = computed(() => {
  const g = geometry.value
  return {
    x: Math.max(
      g.w * (g.mobile ? 0.26 : 0.24),
      Math.min(g.w * (g.mobile ? 0.74 : 0.8), g.x + (g.width * region.value.x) / 100),
    ),
    y: g.y + (g.height * region.value.y) / 100,
  }
})
const scannerStyle = computed(() => ({
  left: `${scanPosition.value.x}px`,
  top: `${scanPosition.value.y}px`,
  opacity: motion.value.scanner,
  transform: `translate(-50%, -50%) scale(${0.78 + motion.value.scan * 0.28})`,
  '--scan-turn': `${40 + motion.value.scan * 660}deg`,
}))
const foundStyle = computed(() => ({
  left: `${scanPosition.value.x}px`,
  top: `${scanPosition.value.y}px`,
  opacity: motion.value.found,
  transform: `translate(-50%, -50%) scale(${0.75 + segment(progress.value, 0.515, 0.56) * 0.47})`,
}))
const portalPinStyle = computed(() => ({
  left: `${geometry.value.targetX}px`,
  top: `${geometry.value.targetY}px`,
  opacity: motion.value.portalPin,
  transform: `translate(-50%, -50%) rotate(-45deg) scale(${0.65 + segment(progress.value, 0.635, 0.715) * 2.55})`,
}))
const routePath = computed(
  () =>
    `M190 340 Q${(190 + region.value.x * 10) / 2} ${Math.min(240, region.value.y * 6.667 - 75)} ${region.value.x * 10} ${region.value.y * 6.667}`,
)
const chapters = [0, 0.1, 0.25, 0.34, 0.45, 0.54, 0.66, 0.81, 0.92, 1]
const select = (index: number) => {
  stop()
  selected.value = index
  locationMessage.value = `Showing an illustrative deal in ${region.value.area}.`
}
const nearMe = async () => {
  stop()
  const location = await locate()
  if (!location) {
    locationMessage.value = 'Location unavailable. You can still choose a neighbourhood below.'
    return
  }
  if (!isWithinSingapore(location)) {
    locationMessage.value =
      'You appear to be outside Singapore. Choose a Singapore neighbourhood to preview.'
    return
  }
  selected.value =
    regions
      .map((area, index) => ({ index, distance: distanceMetres(location, area) }))
      .sort((a, b) => a.distance - b.distance)[0]?.index ?? 4
  locationMessage.value = `Nearest sample neighbourhood: ${region.value.area}. Location stays in your browser.`
}
const shuffle = () => {
  stop()
  shuffled.value += 1
}
</script>

<template>
  <section id="story" ref="root" class="scroll-story cinematic-story" :class="{ 'story-reduced': reduced, 'story-handoff': chapter >= 2 && chapter <= 5, 'story-hawker': reduced || progress >= .78 }" :data-chapter="chapter" :style="{ '--story-paper': `rgb(${Math.round(246 - motion.handoff * 31)}, ${Math.round(243 - motion.handoff * 4)}, ${Math.round(233 + motion.handoff * 7)})` }" aria-label="How Lobangers brings food deals together">
    <span id="neighbourhood" class="neighbourhood-anchor" aria-hidden="true" />
    <div class="story-sticky">
      <div class="story-scrapbook-background" :style="{ opacity: reduced ? 0 : 1 - segment(progress, .14, .23) }" aria-hidden="true" />
      <div class="story-topline">
        <span>A GOOD LOBANG IS WORTH FINDING.</span>
        <div class="story-top-actions">
          <button v-if="!systemReduced && !compactStill" type="button" class="story-still-toggle" :aria-pressed="manualStill" @click="toggleStill">{{ manualStill ? 'Play story motion' : 'Show still version' }}</button>
          <span v-else>{{ systemReduced ? 'Reduced motion' : 'Compact still view' }}</span>
          <a href="#cuisines">Skip to food deals ↘</a>
        </div>
      </div>
      <div class="story-scene-background" :style="{ opacity: motion.handoff }" aria-hidden="true" />
      <div class="story-field" :style="fieldStyle">
        <svg class="collection-force-lines" viewBox="0 0 1000 667" :style="{ opacity: segment(progress, .07, .14) * (1 - segment(progress, .22, .27)), transform: `scale(${.8 + motion.collect * .35})` }" aria-hidden="true">
          <circle cx="500" cy="333" r="190" />
          <circle cx="500" cy="333" r="280" />
        </svg>
        <div class="story-camera" :style="cameraStyle" :inert="!reduced && (progress < .26 || progress > .61)">
          <IllustratedMap art-src="/landing/singapore-map-hero-complete-1536.webp" :active="selected" :show-pins="progress > .205 || reduced" :pin-progress="reduced ? 1 : segment(progress, .205, .27)" :inactive-opacity="1 - motion.zoom" :active-opacity="reduced ? 1 : 1 - segment(progress, .60, .635)" @select="select" />
          <NeighbourhoodDetail :x="region.x * 10" :y="region.y * 6.667" :style="{ opacity: reduced ? 0 : segment(progress, .58, .635) }" />
          <svg class="neighbourhood-route" viewBox="0 0 1000 666.667" :style="{ opacity: motion.route }" aria-hidden="true">
            <path class="route-shadow" :d="routePath" />
            <path :d="routePath" pathLength="1" :style="{ strokeDashoffset: 1 - motion.route }" />
          </svg>
        </div>
        <FloatingSocialPost v-for="(_, index) in regions" v-show="!reduced && progress < .25" :key="index" :index="index" :progress="progress" :reduced="reduced" :shuffle="shuffled" />
      </div>
      <div class="story-vignette" :style="{ opacity: motion.handoff * (1 - motion.portal) }" aria-hidden="true" />
      <div class="story-handoff-caption" :style="{ opacity: segment(progress, .285, .31) * (1 - segment(progress, .345, .375)) }">ONE MAP → YOUR NEIGHBOURHOOD ↓</div>
      <div class="story-copy" :style="copyStyle" :inert="!reduced && copyStyle.opacity < .1">
        <span class="landing-eyebrow" :style="entrance(.34, .365, 10)">{{ scene.label }}</span>
        <Transition name="scene-copy" mode="out-in">
          <div :key="chapter">
            <h2 :style="entrance(.35, .385, 24)">{{ scene.title }}</h2>
            <p :style="entrance(.365, .40)">{{ scene.description }}</p>
          </div>
        </Transition>
        <div class="neighbourhood-controls" :class="{ 'controls-visible': controlsVisible }" :inert="!controlsUsable" :style="entrance(.38, .425, 24)">
          <button type="button" class="landing-button primary" :disabled="status === 'locating'" @click="nearMe">⌖ {{ status === 'locating' ? 'Finding you…' : 'Find Near Me' }}</button>
          <label for="story-area" class="visually-hidden">Choose your neighbourhood</label>
          <select id="story-area" :value="selected" @change="select(Number(($event.target as HTMLSelectElement).value))">
            <option v-for="(area, index) in regions" :key="area.name" :value="index">{{ area.area }}</option>
          </select>
          <p class="location-message" role="status" :style="entrance(.395, .435, 16)">{{ locationMessage }}</p>
          <RouterLink v-if="nearbyLive" :to="`/venues/${nearbyLive.venue.id}`" class="nearby-live-deal">Nearest listed deal: {{ nearbyLive.deal.title }} · {{ nearbyLive.venue.name }} ↗</RouterLink>
          <RouterLink to="/browse" class="story-live-link">Open the live deal map ↗</RouterLink>
        </div>
        <p class="story-hint">{{ scene.hint }}</p>
        <div v-if="chapter < 2 && !reduced" class="story-play-controls">
          <button type="button" @click="shuffle">↝ Shuffle deals</button>
          <button type="button" :aria-pressed="playing" @click="play">{{ playing ? 'Ⅱ Pause story' : '▶ Auto-play story' }}</button>
        </div>
        <button v-if="playing && chapter >= 2" type="button" class="story-pause" @click="stop">Ⅱ Pause story</button>
        
      </div>
      <div v-if="reduced" class="reduced-story-summary">
        <p>
          <strong>Lost in the feed.</strong> Scattered promotions become pins on one map.</p>
        <p>
          <strong>Your neighbourhood.</strong> The map expands, scans and dives into a nearby sample offer.</p>
        <p>
          <strong>The living hawker stall.</strong> Recent sample reports demonstrate community-reported availability. Members can contribute after signing up.</p>
      </div>
      <div class="story-searchlight" :style="{ opacity: motion.scanner }" aria-hidden="true" />
      <div class="story-scan-lens" :style="scannerStyle" aria-hidden="true">
        <span class="scan-reticle" />
      </div>
      <div class="story-found-ring" :style="foundStyle" aria-hidden="true">
        <span>✓ SAMPLE LOBANG LOCATED</span>
      </div>
      <div v-if="chapter === 4" class="story-scan-label" role="status" aria-live="off">
        <small>LOOKING AROUND {{ region.area.toUpperCase() }}</small>
        <strong>{{ motion.scan > .85 ? 'Sample pin located' : 'Scanning your neighbourhood…' }}</strong>
        <div>
          <i :style="{ width: `${motion.scan * 100}%` }" />
        </div>
        <span>{{ Math.round(motion.scan * 100) }}% · illustrative search</span>
      </div>
      <div class="story-portal-pin" :style="portalPinStyle" aria-hidden="true">
        <span><svg class="story-bowl-icon" aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" focusable="false">
          <path d="M7 23H41C40 33 34 40 24 40S8 33 7 23Z M6 23H42 M17 42H31 M15 17C10 12 19 11 14 6 M25 17C20 12 29 11 24 6 M35 17C30 12 39 11 34 6" />
        </svg></span>
      </div>
      <div class="story-food-portal" :style="portalStyle" :aria-hidden="reduced || motion.portal < .98 || motion.transfer > .98">
        <div class="portal-food-copy" :style="{ opacity: motion.offer * (1 - segment(progress, .79, .815)), transform: `translateY(${55 * (1 - motion.offer)}px)` }">
          <span class="landing-eyebrow">⌖ {{ region.area.toUpperCase() }} · SAMPLE NEARBY FIND</span>
          <h2>Close to home.<br />
            <em>Lobang found.</em>
          </h2>
          <p>A delicious possibility, right in your neighbourhood. Next, see what the community says.</p>
        </div>
      </div>
      <CommunityFreshnessScene :deal="deal" :area="region.area" :story-progress="progress" :offer="motion.offer" :reduced="reduced" :viewport="viewport" />
      <button v-if="playing && chapter >= 2" type="button" class="story-playback-stop" @click="stop">Ⅱ Pause story</button>
      <div class="story-bottom">
        <span>{{ chapter < 2 ? 'FIVE FEEDS. TOO MANY TABS.' : chapter < 7 ? 'ONE MAP → YOUR NEIGHBOURHOOD → A NEARBY FIND' : 'STILL ON? GONE? KEEP YOUR NEIGHBOURS IN THE KNOW.' }}</span>
        <div class="story-rail">
          <i v-for="(item, index) in scenes" :key="item.label">
            <b :style="{ width: `${segment(progress, chapters[index] ?? 0, chapters[index + 1] ?? 1) * 100}%` }" />
          </i>
        </div>
        <span class="story-sample-note">Illustrative story · sample offers & votes</span>
      </div>
    </div>
  </section>
</template>
