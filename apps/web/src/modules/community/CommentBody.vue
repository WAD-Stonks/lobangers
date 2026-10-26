<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps<{ body: string }>()
const id = useId()
const paragraph = ref<HTMLElement | null>(null)
const expanded = ref(false)
const long = ref(false)
let observer: ResizeObserver | undefined
const measure = () => {
  const element = paragraph.value
  if (!element) return
  const style = getComputedStyle(element)
  const lineHeight = Number.parseFloat(style.lineHeight) || 24
  long.value = element.scrollHeight > lineHeight * 3 + 1
}
watch(() => props.body, async () => {
  expanded.value = false
  await nextTick()
  measure()
})
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && paragraph.value) {
    observer = new ResizeObserver(measure)
    observer.observe(paragraph.value)
  }
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <p :id="id" ref="paragraph" class="deal-community-body" :class="{ 'deal-community-body--collapsed': !expanded }">{{ body }}</p>
  <button v-if="long" class="comment-body-toggle" type="button" :aria-expanded="expanded" :aria-controls="id" @click="expanded = !expanded">{{ expanded ? 'Show less' : 'Read more' }}</button>
</template>

<style scoped>
.deal-community-body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.875rem; line-height: 1.7; margin: 12px 0 4px; }
.deal-community-body--collapsed { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.comment-body-toggle { display: inline-flex; align-items: center; min-height: 44px; padding: 6px 0; border: 0; border-radius: 4px; background: transparent; color: var(--coral-deep); font: 600 0.8125rem/1.5 var(--font-sans); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.comment-body-toggle:focus-visible { outline: 3px solid var(--coral-deep); outline-offset: 3px; }
</style>
