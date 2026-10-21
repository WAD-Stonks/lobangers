<script setup lang="ts">
import { onMounted, ref } from 'vue'

// One deal photo filling its frame. A soft shimmer runs until the image has loaded, then the
// photo fades in. The parent owns the frame's shape and learns the photo's from `ratio`.
const props = withDefaults(defineProps<{ src: string; alt: string; eager?: boolean }>(), { eager: false })
const emit = defineEmits<{ ratio: [number]; error: [] }>()

const loaded = ref(false)
const img = ref<HTMLImageElement | null>(null)

const onLoad = () => {
  const el = img.value
  if (!el || el.naturalWidth === 0 || el.naturalHeight === 0) return
  loaded.value = true
  emit('ratio', el.naturalWidth / el.naturalHeight)
}

// A cached image can finish before the listener is attached.
onMounted(() => {
  if (img.value?.complete) onLoad()
})
</script>

<template>
  <span class="deal-photo" :class="{ 'is-loading': !loaded }" :aria-busy="loaded ? undefined : 'true'">
    <img
      ref="img"
      class="deal-photo__img"
      :src="props.src"
      :alt="props.alt"
      :loading="props.eager ? 'eager' : 'lazy'"
      decoding="async"
      referrerpolicy="no-referrer"
      @load="onLoad"
      @error="emit('error')"
    />
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
