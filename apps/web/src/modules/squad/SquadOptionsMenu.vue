<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// The room's options, behind one button so the header stays short: share the code, and for the
// host, close the room at any point. Escape or a tap outside closes it, and focus goes back to
// the button.
defineProps<{ isHost: boolean }>()
const emit = defineEmits<{ share: []; close: [] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const toggle = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)

const items = () => [...(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]

const hide = (returnFocus = true) => {
  open.value = false
  if (returnFocus) toggle.value?.focus()
}

const pick = (choice: 'share' | 'close') => {
  hide()
  if (choice === 'share') emit('share')
  else emit('close')
}

const onKeydown = (event: KeyboardEvent) => {
  const list = items()
  const at = list.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Escape') hide()
  else if (event.key === 'ArrowDown') list[(at + 1) % list.length]?.focus()
  else if (event.key === 'ArrowUp') list[(at - 1 + list.length) % list.length]?.focus()
  else if (event.key === 'Tab') hide(false)
  else return
  event.preventDefault()
}

const onOutside = (event: PointerEvent) => {
  if (root.value && !root.value.contains(event.target as Node)) hide(false)
}

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onOutside)
    await nextTick()
    items()[0]?.focus()
  } else document.removeEventListener('pointerdown', onOutside)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="squad-options">
    <button
      ref="toggle"
      type="button"
      class="lb-btn squad-btn-dark squad-btn-small"
      data-testid="squad-options"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="squad-options-menu"
      @click="open = !open"
    >
      Options
      <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div v-show="open" id="squad-options-menu" ref="menu" class="squad-options__menu" role="menu" aria-label="Room options" @keydown="onKeydown">
      <button type="button" role="menuitem" class="squad-options__item" data-testid="squad-share" @click="pick('share')">Share code</button>
      <button v-if="isHost" type="button" role="menuitem" class="squad-options__item squad-options__item--danger" data-testid="squad-close-room" @click="pick('close')">Close the room</button>
    </div>
  </div>
</template>
