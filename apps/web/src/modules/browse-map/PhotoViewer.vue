<script setup lang="ts">
import type { DealImage } from '@broke-oclock/contracts/deals'
import { safeMediaUrl } from '@web/lib/media-url'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'

// Full-size view of a deal photo on the native modal dialog, so focus trapping, Escape and the
// backdrop behave as the platform expects. Arrow keys and buttons step through several photos.
const props = defineProps<{
  images: readonly DealImage[]
  index: number | null
  altFor: (image: DealImage, index: number) => string
}>()
const emit = defineEmits<{ close: []; select: [number] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const image = computed(() => (props.index === null ? undefined : props.images[props.index]))
const many = computed(() => props.images.length > 1)

watch(
  () => props.index !== null,
  async (open) => {
    await nextTick()
    const element = dialog.value
    // jsdom has no showModal; the photo still renders, only the modal behaviour is missing.
    if (open && element && !element.open) element.showModal?.()
    if (!open && element?.open) element.close()
  },
)

const step = (delta: number) => {
  if (props.index === null || !many.value) return
  const count = props.images.length
  emit('select', (props.index + delta + count) % count)
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
}

// A click on the dialog itself, outside the photo and controls, is a click on the backdrop.
const onClick = (event: MouseEvent) => {
  if (event.target === dialog.value) dialog.value?.close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="photo-viewer"
    aria-label="Deal photo"
    data-testid="photo-viewer"
    @close="emit('close')"
    @click="onClick"
    @keydown="onKeydown"
  >
    <template v-if="image && index !== null">
      <img class="photo-viewer__image" :src="safeMediaUrl(image.url) ?? ''" :alt="altFor(image, index)" />
      <button type="button" class="photo-viewer__button photo-viewer__close" aria-label="Close photo" @click="dialog?.close()">
        <ShellIcon name="close" :size="20" />
      </button>
      <template v-if="many">
        <button type="button" class="photo-viewer__button photo-viewer__prev" aria-label="Previous photo" @click="step(-1)">
          <ShellIcon name="chevronLeft" :size="20" />
        </button>
        <button
          type="button"
          class="photo-viewer__button photo-viewer__next"
          aria-label="Next photo"
          data-testid="viewer-next"
          @click="step(1)"
        >
          <ShellIcon name="chevronRight" :size="20" />
        </button>
        <span class="photo-viewer__count lb-tag lb-tag--paper" aria-live="polite">{{ index + 1 }}/{{ images.length }}</span>
      </template>
    </template>
  </dialog>
</template>

<style scoped>
.photo-viewer {
  width: 100vw;
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  padding: 56px 16px;
  margin: 0;
  background: transparent;
  border: 0;
}

.photo-viewer[open] {
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-viewer::backdrop {
  background: rgb(0 0 0 / 0.85);
}

.photo-viewer__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-control);
}

.photo-viewer__button {
  position: fixed;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--ink);
  cursor: pointer;
  background: var(--paper-white);
  border: 0;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
}

.photo-viewer__close {
  top: 12px;
  right: 12px;
}

.photo-viewer__prev,
.photo-viewer__next {
  top: 50%;
  transform: translateY(-50%);
}

.photo-viewer__prev {
  left: 12px;
}

.photo-viewer__next {
  right: 12px;
}

.photo-viewer__count {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
}
</style>
