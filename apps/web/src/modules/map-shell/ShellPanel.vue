<script setup lang="ts">
import {
  CONTENT_DRAG_IGNORE,
  type ContentDragIntent,
  contentDragIntent,
  scrollState,
} from '@web/modules/map-shell/sheet-content-drag'
import { snapIndex } from '@web/modules/map-shell/sheet-snap'
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    mode: 'side' | 'sheet'
    heights?: readonly number[]
    snap?: number
    wide?: boolean
    collapsed?: boolean
    label?: string
  }>(),
  { heights: () => [120, 400, 680], snap: 1, wide: false, collapsed: false, label: 'Results' },
)
const emit = defineEmits<{ 'update:snap': [index: number] }>()

const SNAP_NAMES = ['Peek', 'Half', 'Full', 'Expanded'] as const

const dragDelta = ref(0)
const dragging = ref(false)
let startY = 0
let lastY = 0
let lastTime = 0
let velocity = 0

const fullHeight = computed(() => props.heights[props.heights.length - 1] ?? 0)
const snapHeight = computed(() => props.heights[props.snap] ?? fullHeight.value)
const visibleHeight = computed(() => {
  const min = props.heights[0] ?? 0
  return Math.min(fullHeight.value, Math.max(min * 0.6, snapHeight.value + dragDelta.value))
})
const offset = computed(() => Math.round(fullHeight.value - visibleHeight.value))
const expanded = computed(() => {
  const belowHeader = props.heights[props.heights.length - 2] ?? fullHeight.value
  return props.mode === 'sheet' && props.heights.length > 3 && visibleHeight.value > belowHeader
})

const sheetStyle = computed(() =>
  props.mode === 'sheet'
    ? {
        height: `${fullHeight.value}px`,
        transform: `translateY(${offset.value}px)`,
        '--sheet-offset': `${offset.value}px`,
      }
    : undefined,
)

const beginDrag = (y: number, time: number) => {
  dragging.value = true
  startY = y
  lastY = y
  lastTime = time
  velocity = 0
}

const moveDrag = (y: number, time: number) => {
  const elapsed = time - lastTime
  if (elapsed > 0) velocity = (lastY - y) / elapsed
  lastY = y
  lastTime = time
  dragDelta.value = startY - y
}

const onPointerDown = (event: PointerEvent) => {
  if (props.mode !== 'sheet' || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  beginDrag(event.clientY, event.timeStamp)
}

const onPointerMove = (event: PointerEvent) => {
  if (dragging.value) moveDrag(event.clientY, event.timeStamp)
}

let contentIntent: ContentDragIntent | null = null
let touchStartX = 0
let touchStartY = 0
let touchScroll = { atTop: true, scrollable: false }

const onContentTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0]
  const root = event.currentTarget as HTMLElement
  const target = event.target as Element
  if (props.mode !== 'sheet' || event.touches.length !== 1 || !touch || target.closest(CONTENT_DRAG_IGNORE)) {
    contentIntent = null
    return
  }
  contentIntent = 'pending'
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  touchScroll = scrollState(target, root)
}

const onContentTouchMove = (event: TouchEvent) => {
  const touch = event.touches[0]
  if (!contentIntent || contentIntent === 'scroll' || !touch) return
  if (contentIntent === 'pending') {
    contentIntent = contentDragIntent({ dx: touch.clientX - touchStartX, dy: touch.clientY - touchStartY, ...touchScroll })
    if (contentIntent !== 'sheet') return
    beginDrag(touchStartY, event.timeStamp)
  }
  event.preventDefault()
  moveDrag(touch.clientY, event.timeStamp)
}

const onContentTouchEnd = () => {
  const ownsGesture = contentIntent === 'sheet'
  contentIntent = null
  if (ownsGesture) release()
}

const release = () => {
  if (!dragging.value) return
  dragging.value = false
  const moved = Math.abs(dragDelta.value) > 4
  const next = moved
    ? snapIndex(props.heights, { height: snapHeight.value + dragDelta.value, velocity, start: props.snap })
    :
      (props.snap + 1) % props.heights.length
  dragDelta.value = 0
  emit('update:snap', next)
}

const onKeydown = (event: KeyboardEvent) => {
  const last = props.heights.length - 1
  if (event.key === 'ArrowUp') emit('update:snap', Math.min(last, props.snap + 1))
  else if (event.key === 'ArrowDown') emit('update:snap', Math.max(0, props.snap - 1))
  else return
  event.preventDefault()
}

const onClick = (event: MouseEvent) => {
  if (event.detail === 0) emit('update:snap', (props.snap + 1) % props.heights.length)
}

const handleLabel = computed(
  () => `Resize ${props.label.toLowerCase()} panel, ${SNAP_NAMES[props.snap] ?? 'Half'} height`,
)
</script>

<template>
  <section
    class="shell-panel lb-card"
    :class="[`shell-panel--${mode}`, { 'is-wide': wide, 'is-dragging': dragging, 'is-collapsed': collapsed, 'is-expanded': expanded }]"
    :style="sheetStyle"
    :aria-label="label"
    data-testid="shell-panel"
  >
    <button
      v-if="mode === 'sheet'"
      type="button"
      class="shell-panel__grip"
      :aria-label="handleLabel"
      data-testid="sheet-handle"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="release"
      @pointercancel="release"
      @keydown="onKeydown"
      @click="onClick"
    >
      <span class="shell-panel__grip-bar" aria-hidden="true" />
    </button>
    <div
      class="shell-panel__content"
      @touchstart="onContentTouchStart"
      @touchmove="onContentTouchMove"
      @touchend="onContentTouchEnd"
      @touchcancel="onContentTouchEnd"
    >
      <slot />
    </div>
  </section>
</template>

<style scoped>
.shell-panel {
  background: var(--page-background, var(--paper-white));
  position: absolute;
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: clip;
}

.shell-panel__content {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.shell-panel__content > :deep(*) {
  height: 100%;
}

.shell-panel--side {
  top: var(--space-4);
  right: var(--space-4);
  bottom: var(--space-4);
  width: var(--panel-w);
  transform: translateZ(0);
  transition: transform var(--dur-sheet) var(--ease-drawer);
}

.shell-panel--side.is-collapsed {
  visibility: hidden;
  transform: translateX(calc(100% + var(--space-4) + 32px));
  transition:
    transform var(--dur-sheet) var(--ease-drawer),
    visibility 0s linear var(--dur-sheet);
}

.shell-panel--sheet {
  right: var(--sheet-gutter, 0px);
  bottom: 0;
  left: var(--sheet-gutter, 0px);
  border-bottom: 0;
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  box-shadow: 0 -12px 32px rgba(27, 27, 31, 0.12);
  transition: transform var(--dur-sheet) var(--ease-drawer);
  touch-action: none;
}

.app-palette[data-theme='dark'] .shell-panel--sheet {
  box-shadow: var(--shadow-card);
}

.shell-panel--sheet :deep(.panel-frame__actions) {
  transition: transform var(--dur-sheet) var(--ease-drawer);
}

.shell-panel--sheet.is-dragging,
.shell-panel--sheet.is-dragging :deep(.panel-frame__actions) {
  transition: none;
}

.shell-panel--sheet .shell-panel__content {
  padding-top: 24px;
  touch-action: pan-y;
}

.shell-panel__grip {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: min(160px, 50%);
  height: 44px;
  padding: 0;
  background: transparent;
  border: 0;
  transform: translateX(-50%);
  cursor: grab;
  touch-action: none;
}

.shell-panel__grip:active {
  cursor: grabbing;
}

.shell-panel__grip:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -3px;
}

.shell-panel__grip-bar {
  width: 44px;
  height: 5px;
  background: var(--track);
  border-radius: var(--radius-pill);
}

.shell-panel--sheet.is-expanded {
  z-index: 35;
  border-radius: 0;
}

.shell-panel--sheet.is-expanded .shell-panel__content {
  padding-top: calc(24px + env(safe-area-inset-top, 0px));
}

.shell-panel--sheet.is-expanded .shell-panel__grip {
  top: env(safe-area-inset-top, 0px);
}

@media (prefers-reduced-motion: reduce) {
  .shell-panel--side,
  .shell-panel--side.is-collapsed,
  .shell-panel--sheet,
  .shell-panel--sheet :deep(.panel-frame__actions) {
    transition: none;
  }
}
</style>
