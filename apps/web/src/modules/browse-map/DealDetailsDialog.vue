<script setup lang="ts">
import DealPanel from '@web/modules/browse-map/DealPanel.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{ restoreFocusTo: HTMLElement | null }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const previousFocus = props.restoreFocusTo
const route = useRoute()
let frame = 0
let observer: MutationObserver | undefined
let sizedFor = ''
const sizePoster = () => {
  const root = dialog.value
  if (!root || root.querySelector('.deal-panel--comments')) return
  const imageSource = root.querySelector<HTMLImageElement>('.deal-photo__img')?.src ?? ''
  const layoutKey = JSON.stringify([route.params.dealId, route.query.at, imageSource, window.innerWidth, window.innerHeight])
  if (sizedFor === layoutKey) return
  root.classList.remove('deal-dialog--stacked')
  if (window.innerWidth < 992) {
    sizedFor = ''
    return
  }
  const body = root.querySelector<HTMLElement>('.panel-frame__body')
  const media = root.querySelector<HTMLElement>('.deal-panel__media')
  const image = media?.querySelector<HTMLImageElement>('.deal-photo__img')
  const verification = root.querySelector<HTMLElement>('.deal-community-verification')
  if (!body || !media || !image?.naturalWidth || !image.naturalHeight || !verification) return
  if (root.querySelector('.deal-community-loading')) return
  const style = getComputedStyle(body)
  const available = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24
  if (available < 640) return
  const mediaTop = media.getBoundingClientRect().top
  const ratio = image.naturalWidth / image.naturalHeight
  const actionsTop = root.querySelector('.panel-frame__actions')?.getBoundingClientRect().top ?? root.getBoundingClientRect().bottom
  const fitsWidth = (actionsTop - mediaTop - 24) * ratio
  let high = Math.min(available - 360, fitsWidth)
  let low = Math.min(280, high)
  let bestWidth = low
  let bestDifference = Infinity
  for (let step = 0; step < 12; step++) {
    const width = (low + high) / 2
    body.style.setProperty('--poster-width', `${width}px`)
    const height = verification.getBoundingClientRect().bottom - mediaTop
    const difference = width / ratio - height
    if (Math.abs(difference) < bestDifference) {
      bestDifference = Math.abs(difference)
      bestWidth = width
    }
    if (difference < 0) low = width
    else high = width
  }
  body.style.setProperty('--poster-width', `${bestWidth}px`)
  const heldToView = bestWidth >= high - 2 && high === fitsWidth
  root.classList.toggle('deal-dialog--stacked', bestDifference > 16 && !heldToView)
  sizedFor = layoutKey
}
const schedulePoster = () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(sizePoster)
}
const onKeydown = (event: KeyboardEvent) => {
  if (event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const elements = [...(dialog.value?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
    .filter((element) => !element.matches(':disabled, [hidden]') && !element.closest('[inert], [hidden]'))
  const first = elements[0]
  const last = elements.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onMounted(async () => {
  await nextTick()
  closeButton.value?.focus()
  observer = new MutationObserver(schedulePoster)
  if (dialog.value) {
    observer.observe(dialog.value, { subtree: true, childList: true, characterData: true })
    dialog.value.addEventListener('load', schedulePoster, true)
  }
  window.addEventListener('resize', schedulePoster)
  void document.fonts?.ready.then(schedulePoster)
  schedulePoster()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  dialog.value?.removeEventListener('load', schedulePoster, true)
  window.removeEventListener('resize', schedulePoster)
  void nextTick(() => {
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  })
})
</script>

<template>
  <div class="deal-dialog__backdrop" aria-hidden="true" data-testid="deal-dialog-backdrop" @click="emit('close')" />
  <section ref="dialog" class="deal-dialog lb-card" role="dialog" aria-modal="true" aria-labelledby="deal-dialog-title" data-testid="deal-dialog" @keydown="onKeydown">
    <header class="deal-dialog__header">
      <p id="deal-dialog-title" class="deal-dialog__title">Deal details</p>
      <button ref="closeButton" class="lb-ctrl lb-ctrl--flat" type="button" aria-label="Close deal details" @click="emit('close')"><ShellIcon name="close" :size="18" /></button>
    </header>
    <div class="deal-dialog__content"><DealPanel dialog /></div>
  </section>
</template>

<style scoped>
.deal-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: var(--scrim);
}

.deal-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: min(1240px, calc(100vw - 32px));
  height: min(88dvh, 960px);
  max-height: calc(100dvh - 32px);
  overflow: hidden;
  border-radius: 28px;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.22);
  transform: translate(-50%, -50%);
}

.deal-dialog__header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  flex: none;
  padding: 14px 20px;
  border-bottom: 1px solid var(--hairline);
}

.deal-dialog__title {
  grid-column: 2;
  margin: 0;
  font-size: 1.2rem;
  font-weight: 750;
  text-align: center;
}

.deal-dialog__content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.deal-dialog__content > :deep(*) {
  height: 100%;
}

@media (min-width: 992px) {
  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel--dialog:not(.deal-panel--comments) .panel-frame__body) {
    display: grid;
    grid-template-columns: minmax(0, var(--poster-width, 1.05fr)) minmax(0, 1fr);
    grid-template-rows: repeat(6, min-content);
    align-content: start;
    align-items: start;
    gap: 18px 24px;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.panel-frame__body > *) {
    grid-column: 1 / -1;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel__media) {
    grid-column: 1;
    grid-row: 1 / 7;
    align-self: stretch;
    position: relative;
    min-height: 0;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel__media .deal-gallery) {
    position: absolute;
    inset: 0;
    width: auto;
    height: 100%;
    aspect-ratio: auto;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel__media .deal-photo__img) {
    object-fit: contain;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel__status) {
    grid-column: 2;
    grid-row: 1;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.panel-frame__heading) {
    grid-column: 2;
    grid-row: 2;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel__headline) {
    grid-column: 2;
    grid-row: 3;
    margin: var(--space-1) 0 0;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel__tags) {
    grid-column: 2;
    grid-row: 4;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel__fine-print) {
    grid-column: 2;
    grid-row: 5;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel--dialog:not(.deal-panel--comments) .deal-community) {
    display: contents;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel--dialog:not(.deal-panel--comments) .deal-community-overview) {
    grid-column: 2;
    grid-row: 6;
    border-top: 1px solid var(--hairline);
    padding-top: 24px;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.squad-cta) {
    grid-row: 7;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep(.deal-panel--dialog:not(.deal-panel--comments) .deal-community-discussion) {
    grid-column: 1 / -1;
    grid-row: 8;
    border-top: 1px solid var(--hairline);
    padding-top: 24px;
  }

  .deal-dialog:not(.deal-dialog--stacked):not(:has(.deal-panel--no-image)) .deal-dialog__content :deep([data-testid='deal-outlets']) {
    grid-row: 9;
    padding-top: 20px;
    border-top: 1px solid var(--hairline);
  }
}

.deal-dialog:has(.deal-panel--no-image) { width: min(760px, calc(100vw - 32px)); }
.deal-dialog__content :deep(.deal-panel--no-image .panel-frame__body > *) { order: 3; }
.deal-dialog__content :deep(.deal-panel--no-image .deal-panel__status) { order: 0; }
.deal-dialog__content :deep(.deal-panel--no-image .panel-frame__heading) { order: 1; }

.deal-dialog--stacked { width: min(900px, calc(100vw - 32px)); }
.deal-dialog--stacked .deal-dialog__content :deep(.panel-frame__body > *) { order: 3; }
.deal-dialog--stacked .deal-dialog__content :deep(.deal-panel__media) { order: 0; }
.deal-dialog--stacked .deal-dialog__content :deep(.deal-panel__status) { order: 1; }
.deal-dialog--stacked .deal-dialog__content :deep(.panel-frame__heading) { order: 2; }

@media (max-width: 991.98px) {
  .deal-dialog__content :deep(.panel-frame__body > *) { order: 3; }
  .deal-dialog__content :deep(.deal-panel__media) { order: 0; }
  .deal-dialog__content :deep(.deal-panel__status) { order: 1; }
  .deal-dialog__content :deep(.panel-frame__heading) { order: 2; }
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.deal-dialog__content :deep(.deal-panel__status) {
  margin-bottom: -10px;
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.deal-dialog__content :deep(.panel-frame__heading) {
  margin-bottom: -8px;
}

.deal-dialog__content :deep(.panel-frame__title) {
  color: var(--coral-deep);
  font-size: clamp(1.8rem, 3vw, 2.125rem);
  line-height: 1.2;
}

.deal-dialog__content :deep(.deal-gallery) {
  --gallery-max-height: min(56dvh, 580px);
  align-self: center;
  width: min(100%, calc(var(--gallery-max-height) * var(--frame-ratio)));
  background: transparent;
  border-radius: 0;
}

.deal-dialog__content :deep(.deal-photo__img) {
  object-fit: contain;
  object-position: center top;
}

@media (max-width: 991.98px) {
  .deal-dialog__content :deep(.deal-gallery) {
    --gallery-max-height: min(52dvh, 520px);
  }
}

@media (max-width: 599.98px) {
  .deal-dialog {
    width: calc(100vw - 16px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
    height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    border-radius: 22px;
  }
}
</style>
