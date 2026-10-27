<script setup lang="ts">
import { safeMediaUrl } from '@web/lib/media-url'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

// One deal photo filling its frame. A soft shimmer runs until the image has loaded, then the
// photo fades in. The parent owns the frame's shape and learns the photo's from `ratio`.
const props = withDefaults(defineProps<{ src: string; alt: string; eager?: boolean }>(), { eager: false })
const emit = defineEmits<{ ratio: [number]; error: [] }>()

const safeUrl = computed(() => safeMediaUrl(props.src))
const failed = ref(false)
const loaded = ref(false)
const img = ref<HTMLImageElement | null>(null)

const onLoad = (event?: Event) => {
  const el = img.value
  if ((event && event.currentTarget !== el) || !el || el.naturalWidth === 0 || el.naturalHeight === 0) return
  loaded.value = true
  emit('ratio', el.naturalWidth / el.naturalHeight)
}

const onError = (event: Event) => {
  if (event.currentTarget !== img.value) return
  failed.value = true
  emit('error')
}

watch(() => props.src, async () => {
  loaded.value = false
  failed.value = false
  if (!safeUrl.value) emit('error')
  await nextTick()
  if (img.value?.complete) onLoad()
}, { immediate: true })

// A cached image can finish before the listener is attached.
onMounted(() => {
  if (img.value?.complete) onLoad()
})
</script>

<template>
  <span class="deal-photo" :class="{ 'is-loading': safeUrl && !failed && !loaded }" :aria-busy="safeUrl && !failed && !loaded ? 'true' : undefined">
    <img
      v-if="safeUrl && !failed"
      :key="safeUrl"
      ref="img"
      class="deal-photo__img"
      referrerpolicy="no-referrer"
      :src="safeUrl"
      :alt="props.alt"
      :loading="props.eager ? 'eager' : 'lazy'"
      decoding="async"
      @load="onLoad"
      @error="onError"
    />
    <span v-else role="img" :aria-label="failed ? 'Image unavailable' : 'No photo for this deal yet'">{{ failed ? 'Image unavailable' : 'No photo' }}</span>
  </span>
</template>

<style scoped>
.deal-photo {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* A light band sweeping across the tint: loading, not broken. */
.deal-photo::before {
  position: absolute;
  inset: 0;
  content: '';
  background: linear-gradient(
    100deg,
    transparent 20%,
    rgb(255 255 255 / 0.45) 50%,
    transparent 80%
  );
  background-size: 220% 100%;
  opacity: 0;
  transition: opacity 200ms var(--ease-out);
  pointer-events: none;
}

.deal-photo.is-loading::before {
  opacity: 1;
  animation: deal-photo-shimmer 1.3s linear infinite;
}

.deal-photo__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 1;
  transition: opacity 260ms var(--ease-out);
}

.deal-photo.is-loading .deal-photo__img {
  opacity: 0;
}

@keyframes deal-photo-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .deal-photo.is-loading::before {
    animation: none;
  }

  .deal-photo::before,
  .deal-photo__img {
    transition: none;
  }
}
</style>
