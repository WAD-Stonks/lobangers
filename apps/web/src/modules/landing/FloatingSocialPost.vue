<script setup lang="ts">
import { money, regions, samples } from '@web/modules/landing/deals'
import { segment } from '@web/modules/landing/use-story-progress'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ index: number; progress: number; reduced: boolean; shuffle?: number }>(),
  { shuffle: 0 },
)
const root = ref<HTMLElement | null>(null)
const dragging = ref(false)
const offset = ref({ x: 0, y: 0 })
const platforms = ['Telegram', 'TikTok', 'WordPress', 'Instagram', 'Telegram']
const seeds = [
  [24, 20],
  [78, 20],
  [79, 81],
  [23, 81],
  [52, 50],
] as const
const angles = [-8, 5, 6, -5, 3]
const sample = computed(() => samples[props.index] ?? samples[0])
const style = computed(() => {
  const gather = segment(props.progress, 0.08, 0.235)
  const seed = seeds[props.index] ?? seeds[0]
  const region = regions[props.index] ?? regions[0]
  const fade = segment(props.progress, 0.21, 0.25)
  return {
    left: `${seed[0] + (region.x - seed[0]) * gather}%`,
    top: `${seed[1] + (region.y - seed[1]) * gather}%`,
    transform: `translate(-50%, -50%) translate(${offset.value.x * (1 - gather)}px, ${offset.value.y * (1 - gather)}px) rotate(${(angles[props.index] ?? 0) * (1 - gather)}deg) scale(${1 - gather * 0.83})`,
    opacity: 1 - fade,
    pointerEvents: props.progress < 0.14 ? ('auto' as const) : ('none' as const),
  }
})
let frame = 0
let visible = false
let observer: IntersectionObserver | undefined
let pointer = { x: 0, y: 0 }
let velocity = { x: 0, y: 0 }
let previous = 0
const tick = (time: number) => {
  frame = 0
  if (!visible || document.hidden || props.reduced || props.progress > 0.25) return
  const dt = Math.min(2, (time - previous) / 16.67 || 1)
  previous = time
  if (!dragging.value) {
    const tx = Math.sin(time / 1800 + props.index * 2) * 4
    const ty = Math.cos(time / 2100 + props.index) * 5
    velocity.x = (velocity.x + (tx - offset.value.x) * 0.018 * dt) * 0.88
    velocity.y = (velocity.y + (ty - offset.value.y) * 0.018 * dt) * 0.88
    offset.value = { x: offset.value.x + velocity.x * dt, y: offset.value.y + velocity.y * dt }
  }
  frame = requestAnimationFrame(tick)
}
const resume = () => {
  if (!frame) {
    previous = 0
    frame = requestAnimationFrame(tick)
  }
}
const start = (event: PointerEvent) => {
  if (props.reduced || props.progress > 0.14) return
  dragging.value = true
  pointer = { x: event.clientX - offset.value.x, y: event.clientY - offset.value.y }
  root.value?.setPointerCapture(event.pointerId)
}
const move = (event: PointerEvent) => {
  if (!dragging.value) return
  offset.value = {
    x: Math.max(-55, Math.min(55, event.clientX - pointer.x)),
    y: Math.max(-45, Math.min(45, event.clientY - pointer.y)),
  }
}
const release = () => {
  dragging.value = false
  resume()
}
watch(
  () => props.shuffle,
  () => {
    if (props.reduced) return
    velocity = {
      x: Math.sin(props.shuffle + props.index * 1.9) * 14,
      y: Math.cos(props.shuffle + props.index * 2.1) * 12,
    }
    resume()
  },
)
const visibility = () => {
  if (!document.hidden) resume()
}
onMounted(() => {
  if (!globalThis.IntersectionObserver) return
  observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    if (visible) resume()
  })
  if (root.value) observer.observe(root.value)
  document.addEventListener('visibilitychange', visibility)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
  document.removeEventListener('visibilitychange', visibility)
})
</script>

<template>
  <article ref="root" class="social-post" :class="[{ dragging }, `social-${index}`]" :style="style" @pointerdown="start" @pointermove="move" @pointerup="release" @pointercancel="release" @lostpointercapture="release">
    <header>
      <b class="platform-icon" aria-hidden="true">{{ ['➤', '♪', 'W', '◎', '➤'][index] }}</b>
      <span>
        <strong>{{ platforms[index] }}</strong>
        <small>{{ index === 2 ? 'The lunch break blog' : 'little island eats' }}</small>
      </span>
      <span class="post-dots" aria-hidden="true">···</span>
    </header>
    <div class="social-photo">
      <img :src="sample.image" :alt="`${sample.icon} sample food promotion`" loading="lazy" draggable="false" />
      <span v-if="index === 1" class="social-play" aria-hidden="true">▶</span>
      <span class="social-offer">{{ sample.badge }}</span>
    </div>
    <div class="social-caption">
      <strong>{{ sample.restaurant }}</strong>
      <p>{{ index === 2 ? 'Our latest lunch find: noodles for less.' : sample.title }}</p>
      <b>{{ money(sample.price) }}</b> <span>· {{ regions[index]?.area }}</span>
      <small>Illustrative post</small>
    </div>
  </article>
</template>
