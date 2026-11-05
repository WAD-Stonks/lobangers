<script setup lang="ts">
import {
  createTypeahead,
  firstIndex,
  isPrintableKey,
  lastIndex,
  startIndex,
  stepIndex,
} from '@web/components/listbox-navigation'
import type { SelectOption } from '@web/components/select-options'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: readonly SelectOption[]
    disabled?: boolean
    placeholder?: string
    chevron?: boolean
  }>(),
  { disabled: false, placeholder: '', chevron: true },
)
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()

const GAP = 4
const EDGE = 8
const MAX_HEIGHT = 288
const MIN_ROOM = 160

const uid = useId()
const listId = `${uid}-listbox`
const optionId = (index: number) => `${uid}-option-${index}`

const trigger = ref<HTMLButtonElement | null>(null)
const list = ref<HTMLElement | null>(null)
const open = ref(false)
const active = ref(-1)
const placement = ref<Record<string, string>>({})
const typeahead = createTypeahead()

const selectedLabel = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label ?? props.placeholder,
)

const host = ref<HTMLElement | 'body'>('body')

const fixedOrigin = () => {
  const dialog = host.value
  if (dialog === 'body' || getComputedStyle(dialog).transform === 'none') {
    return { left: 0, top: 0, bottom: window.innerHeight }
  }
  const { left, top, bottom } = dialog.getBoundingClientRect()
  return { left, top, bottom }
}

const place = () => {
  const button = trigger.value
  if (!button) return
  const rect = button.getBoundingClientRect()
  const origin = fixedOrigin()
  const below = window.innerHeight - rect.bottom - EDGE
  const above = rect.top - EDGE
  const upward = below < MIN_ROOM && above > below
  const room = Math.max(Math.min(MAX_HEIGHT, upward ? above : below) - GAP, MIN_ROOM / 2)
  const left = Math.max(EDGE, rect.left)
  placement.value = {
    left: `${left - origin.left}px`,
    minWidth: `${rect.width}px`,
    maxWidth: `${Math.max(rect.width, window.innerWidth - left - EDGE)}px`,
    maxHeight: `${room}px`,
    fontSize: getComputedStyle(button).fontSize,
    ...(upward
      ? { bottom: `${origin.bottom - rect.top + GAP}px` }
      : { top: `${rect.bottom + GAP - origin.top}px` }),
  }
}

const revealActive = () =>
  nextTick(() => document.getElementById(optionId(active.value))?.scrollIntoView?.({ block: 'nearest' }))

const show = () => {
  if (props.disabled || open.value) return
  active.value = startIndex(props.options, props.modelValue)
  host.value = trigger.value?.closest('dialog') ?? 'body'
  place()
  open.value = true
  revealActive()
}

const hide = () => {
  open.value = false
}

const choose = (index: number) => {
  const option = props.options[index]
  if (!option || option.disabled) return
  hide()
  trigger.value?.focus()
  if (option.value === props.modelValue) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}

const moveTo = (index: number) => {
  active.value = index
  revealActive()
}

const onClosedKey = (event: KeyboardEvent) => {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    show()
  } else if (isPrintableKey(event)) {
    show()
    moveTo(typeahead(props.options, active.value, event.key))
  }
}

const OPEN_KEYS: Record<string, (event: KeyboardEvent) => void> = {
  ArrowDown: (event) => (event.altKey ? choose(active.value) : moveTo(stepIndex(props.options, active.value, 1))),
  ArrowUp: (event) => (event.altKey ? choose(active.value) : moveTo(stepIndex(props.options, active.value, -1))),
  Home: () => moveTo(firstIndex(props.options)),
  End: () => moveTo(lastIndex(props.options)),
  PageUp: () => moveTo(firstIndex(props.options)),
  PageDown: () => moveTo(lastIndex(props.options)),
  Enter: () => choose(active.value),
  ' ': () => choose(active.value),
  Escape: (event) => {
    event.stopPropagation()
    hide()
  },
}

const onKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  if (!open.value) return onClosedKey(event)
  if (event.key === 'Tab') return hide()
  const handler = OPEN_KEYS[event.key]
  if (handler) {
    event.preventDefault()
    handler(event)
  } else if (isPrintableKey(event)) {
    moveTo(typeahead(props.options, active.value, event.key))
  }
}

const inside = (target: EventTarget | null) =>
  target instanceof Node && (trigger.value?.contains(target) || list.value?.contains(target))

const onOwnLabel = (target: EventTarget | null) =>
  target instanceof Element && target.closest('label')?.control === trigger.value

const onOutsidePointer = (event: Event) => {
  if (!inside(event.target) && !onOwnLabel(event.target)) hide()
}

const onViewportChange = (event: Event) => {
  if (event.type === 'scroll' && inside(event.target)) return
  place()
}

const listen = (on: boolean) => {
  const method = on ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', onOutsidePointer, true)
  window[method]('resize', onViewportChange)
  window[method]('scroll', onViewportChange, true)
}

watch(open, (value) => listen(value))
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) hide()
  },
)
onBeforeUnmount(() => listen(false))
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="app-select"
    :class="{ 'app-select--chevron': chevron }"
    role="combobox"
    aria-haspopup="listbox"
    :aria-expanded="open ? 'true' : 'false'"
    :aria-controls="listId"
    :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
    :data-value="modelValue"
    :disabled="disabled"
    @click="open ? hide() : show()"
    @keydown="onKeydown"
  >
    <span class="app-select__label">{{ selectedLabel }}</span>
    <svg v-if="chevron" class="app-select__chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <Teleport :to="host">
      <div
        v-if="open"
        :id="listId"
        ref="list"
        class="app-select-list"
        role="listbox"
        :style="placement"
        @mousedown.prevent
      >
        <!-- biome-ignore lint/a11y/useKeyWithClickEvents: the combobox owns keyboard selection -->
        <div
          v-for="(option, index) in options"
          :id="optionId(index)"
          :key="`${index}-${option.value}`"
          class="app-select-list__option"
          :class="{ 'is-active': index === active, 'is-selected': option.value === modelValue }"
          role="option"
          tabindex="-1"
          :data-value="option.value"
          :aria-selected="option.value === modelValue ? 'true' : 'false'"
          :aria-disabled="option.disabled ? 'true' : undefined"
          @mousedown.prevent
          @mousemove="!option.disabled && active !== index && (active = index)"
          @click="choose(index)"
        >
          <span>{{ option.label }}</span>
          <svg v-if="option.value === modelValue" class="app-select-list__check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="m3 8.5 3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    </Teleport>
  </button>
</template>

<style>
.app-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  text-align: start;
  cursor: pointer;
  touch-action: manipulation;
}

.app-select.form-select {
  display: flex;
  width: 100%;
  background-image: none;
}

.app-select:disabled {
  cursor: not-allowed;
}

.app-select__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__chevron {
  position: absolute;
  inset-inline-end: var(--app-select-chevron-inset, 0.75rem);
  top: 50%;
  width: 1em;
  height: 1em;
  max-width: 16px;
  max-height: 16px;
  transform: translateY(-50%);
  pointer-events: none;
}

.app-select--chevron:not(.form-select) {
  padding-inline-end: calc(var(--app-select-chevron-inset, 0.75rem) + 1.25em);
}

.app-select-list {
  position: fixed;
  z-index: 1085;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--hairline-strong, #c9c6bf);
  border-radius: var(--radius-control, 0.75rem);
  background: var(--paper-white, #fff);
  color: var(--ink, #1b1b1f);
  box-shadow: var(--shadow-card);
  font-family: var(--font-sans, inherit);
  line-height: 1.35;
  animation: app-select-in var(--dur-small, 180ms) var(--ease-out, ease-out);
}

.app-select-list__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  padding: 8px 10px;
  border-radius: calc(var(--radius-control, 0.75rem) - 4px);
  cursor: pointer;
  overflow-wrap: anywhere;
}

.app-select-list__option.is-active {
  background: var(--paper-hover, #f6f5f2);
}

.app-select-list__option.is-selected {
  font-weight: 600;
}

.app-select-list__option[aria-disabled='true'] {
  color: var(--ink-muted, #6f6e73);
  cursor: not-allowed;
  opacity: 0.6;
}

.app-select-list__check {
  flex: none;
  width: 16px;
  height: 16px;
}

@keyframes app-select-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-select-list {
    animation: none;
  }
}
</style>
