<script setup lang="ts">
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import { inject, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { routeLocationKey } from 'vue-router'

defineProps<{ label: string }>()
const route = inject(routeLocationKey, null)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const panelId = useId()
const close = (restoreFocus = false) => {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}
const outside = (event: PointerEvent) => {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}
const focusChanged = (event: FocusEvent) => {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}
const escapeKey = (event: KeyboardEvent) => {
  if (!open.value || event.key !== 'Escape' || !(event.target instanceof Node) || !root.value?.contains(event.target)) return
  event.preventDefault()
  event.stopPropagation()
  close(true)
}
watch(() => route?.fullPath, () => close())
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', focusChanged)
  document.addEventListener('keydown', escapeKey)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin', focusChanged)
  document.removeEventListener('keydown', escapeKey)
})
</script>

<template>
  <div ref="root" class="admin-account">
    <button ref="trigger" type="button" class="admin-account-trigger" aria-label="Admin account" :aria-expanded="open" :aria-controls="panelId" @click="open = !open">
      <span class="admin-avatar"><AdminIcon name="user" /></span><span class="admin-account-name">{{ label }}</span><AdminIcon name="chevron" />
    </button>
    <!-- Presentation only: never conditionally mount the session controller or slot. -->
    <div v-show="open" :id="panelId" class="admin-account-panel"><slot /></div>
  </div>
</template>
