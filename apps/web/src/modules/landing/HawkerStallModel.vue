<script setup lang="ts">
import type { communityTimeline } from '@web/modules/landing/community-freshness'
import type { SampleDeal } from '@web/modules/landing/deals'
import HawkerStallFallback from '@web/modules/landing/HawkerStallFallback.vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ motion: ReturnType<typeof communityTimeline>; deal: SampleDeal; area: string; active: boolean; reduced: boolean }>()
const emit = defineEmits<{ ready: [value: boolean]; anchors: [value: {sign:{x:number;y:number};status:{x:number;y:number}}] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
const failed = ref(false)
let engine: ReturnType<typeof import('@web/modules/landing/hawker-three')['createHawker']> | undefined
let observer: ResizeObserver | undefined
let frame = 0
let disposed = false
let building = false
const draw = () => {
  if (frame || !engine || !props.active || document.hidden) return
  frame = requestAnimationFrame(() => { frame = 0; engine?.render(props.motion) })
}
const load = async () => {
  if (!props.active || building || engine || failed.value || !canvas.value || typeof WebGLRenderingContext === 'undefined') return
  const device = navigator as Navigator & {deviceMemory?: number; connection?: {saveData?: boolean}}
  if (device.connection?.saveData || (device.deviceMemory ?? 8) <= 2) return
  building = true
  try {
    const { createHawker } = await import('@web/modules/landing/hawker-three')
    await document.fonts?.ready
    if (disposed || !canvas.value) return
    engine = createHawker(canvas.value, props.deal, props.area)
    observer = new ResizeObserver(([entry]) => {
      if (!entry || !engine) return
      engine.resize(entry.contentRect.width, entry.contentRect.height); emit('anchors', engine.anchors()); draw()
    })
    observer.observe(canvas.value)
    ready.value = true; emit('ready', true)
    draw()
  } catch { failed.value = true }
  finally { building = false }
}
const rebuild = () => {
  observer?.disconnect();engine?.dispose();engine=undefined;ready.value=false;emit('ready',false);load()
}
watch(() => props.motion, draw, { deep: true })
watch(() => props.active, () => {load();draw()})
watch(() => [props.deal.id,props.area], rebuild)
const contextLost = (event: Event) => {event.preventDefault();failed.value=true;ready.value=false;emit('ready',false);observer?.disconnect();engine?.dispose();engine=undefined}
onMounted(() => {load();document.addEventListener('visibilitychange',draw)})
onBeforeUnmount(() => {disposed=true;cancelAnimationFrame(frame);observer?.disconnect();engine?.dispose();document.removeEventListener('visibilitychange',draw)})
</script>

<template>
  <div class="hawker-renderer" :class="{ 'webgl-ready': ready }" :data-renderer="ready ? 'three' : 'vector-fallback'">
    <canvas v-show="active" ref="canvas" class="hawker-canvas" aria-hidden="true" @webglcontextlost="contextLost" />
    <HawkerStallFallback v-if="!ready" :motion="motion" :cuisine="deal.cuisine" :badge="deal.badge" />
    <p class="visually-hidden">Miniature hawker stall with a coral and gold striped awning, green pillars, a food display, bowls, plants and stools. {{ deal.restaurant }}, {{ area }}. Illustrative offer.</p>
  </div>
</template>
