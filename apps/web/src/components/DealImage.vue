<script setup lang="ts">
import { safeMediaUrl } from '@web/lib/media-url'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ url?: string | null; alt: string }>()
const safeUrl = computed(() => safeMediaUrl(props.url))
const failed = ref(false)
const currentImage = ref<HTMLImageElement | null>(null)
const onImageError = (event: Event) => {
  if (event.currentTarget === currentImage.value) failed.value = true
}
watch(() => props.url, () => { failed.value = false })
</script>

<template>
  <div class="deal-image">
    <img v-if="safeUrl && !failed" :key="safeUrl" ref="currentImage" referrerpolicy="no-referrer" :src="safeUrl" :alt="alt" loading="lazy" decoding="async" @error="onImageError" />
    <div v-else role="img" :aria-label="failed ? 'Image unavailable' : 'No photo for this deal yet'" data-testid="deal-image-placeholder">{{ failed ? 'Image unavailable' : 'No photo' }}</div>
  </div>
</template>

<style scoped>
.deal-image {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: var(--radius-control, 0.375rem);
  background: var(--paper, var(--bs-secondary-bg));
  color: var(--ink-muted, var(--bs-secondary-color));
  font-size: 0.875rem;
}
.deal-image img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
}
</style>
