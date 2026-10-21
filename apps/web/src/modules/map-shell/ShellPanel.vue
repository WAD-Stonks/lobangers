<script setup lang="ts">
import { snapIndex } from '@web/modules/map-shell/sheet-snap'
import { computed, ref } from 'vue'

// The panel slot. From 992px it is a column on the left; below that a bottom sheet with three
// snap heights (peek, half, full). The sheet is always full height and slides with transform,
// so only transform animates; --sheet-offset tells the content how much sits off screen.
const props = withDefaults(
  defineProps<{
    mode: 'side' | 'sheet'
    heights?: readonly number[]
    snap?: number
    wide?: boolean
    // Desktop only: slid off the right edge so the whole map shows.
    collapsed?: boolean
    label?: string
  }>(),
  { heights: () => [120, 400, 680], snap: 1, wide: false, collapsed: false, label: 'Results' },
)
const emit = defineEmits<{ 'update:snap': [index: number] }>()

const SNAP_NAMES = ['Peek', 'Half', 'Full'] as const

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

const sheetStyle = computed(() =>
  props.mode === 'sheet'
    ? {
        height: `${fullHeight.value}px`,
        transform: `translateY(${offset.value}px)`,
        '--sheet-offset': `${offset.value}px`,
      }
    : undefined,
)

const onPointerDown = (event: PointerEvent) => {
  if (props.mode !== 'sheet' || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  dragging.value = true
  startY = event.clientY
  lastY = event.clientY
  lastTime = event.timeStamp
  velocity = 0
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value) return
  const elapsed = event.timeStamp - lastTime
  // Upward movement grows the sheet, so velocity is positive going up.
  if (elapsed > 0) velocity = (lastY - event.clientY) / elapsed
  lastY = event.clientY
  lastTime = event.timeStamp
  dragDelta.value = startY - event.clientY
}

const release = () => {
  if (!dragging.value) return
  dragging.value = false
  const moved = Math.abs(dragDelta.value) > 4
  const next = moved
    ? snapIndex(props.heights, { height: snapHeight.value + dragDelta.value, velocity, start: props.snap })
    : // A tap on the handle steps up, and from full back down to peek.
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

// Enter or Space (a click with no pointer) steps the sheet like a tap does.
const onClick = (event: MouseEvent) => {
  if (event.detail === 0) emit('update:snap', (props.snap + 1) % props.heights.length)
}

const handleLabel = computed(
  () => `Resize ${props.label.toLowerCase()} panel, ${SNAP_NAMES[props.snap] ?? 'Half'} height`,
)
</script>

<template>
  <aside
    class="shell-panel lb-card"
    :class="[`shell-panel--${mode}`, { 'is-wide': wide, 'is-dragging': dragging, 'is-collapsed': collapsed }]"
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
    <div class="shell-panel__content">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.shell-panel {
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

/* Desktop: a full-height card on the right; list mode widens it into a card grid. */
.shell-panel--side {
  top: var(--space-4);
  right: var(--space-4);
  bottom: var(--space-4);
  width: var(--panel-w);
  transform: translateZ(0);
  transition: transform var(--dur-sheet) var(--ease-drawer);
}

/* Off the right edge, clear of its own shadow; hidden once it has slid out. */
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

/* The sticky action bar rides the visible edge, so it moves with the sheet, not ahead of it. */
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

/* A 44px tall target around a small bar, laid over the content's top inset. */
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

@media (prefers-reduced-motion: reduce) {
  .shell-panel--side,
  .shell-panel--side.is-collapsed,
  .shell-panel--sheet,
  .shell-panel--sheet :deep(.panel-frame__actions) {
    transition: none;
  }
}
</style>
