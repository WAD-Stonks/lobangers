<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  tabs: readonly { id: string; label: string }[]
  idPrefix: string
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
function choose(id: string) {
  if (!props.disabled) emit('update:modelValue', id)
}
function navigate(event: KeyboardEvent, index: number) {
  if (props.disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.tabs.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + props.tabs.length) % props.tabs.length
  const tab = props.tabs[next]
  if (!tab) return
  choose(tab.id)
  const list = (event.currentTarget as HTMLElement).parentElement
  list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
}
</script>

<template>
  <div role="tablist" :aria-label="label" class="admin-workspace-tabs">
    <button v-for="(tab, index) in tabs" :id="`${idPrefix}-tab-${tab.id}`" :key="tab.id"
      type="button" role="tab" :aria-selected="modelValue === tab.id"
      :aria-controls="`${idPrefix}-panel-${tab.id}`" :tabindex="modelValue === tab.id ? 0 : -1"
      :disabled="disabled" @click="choose(tab.id)" @keydown="navigate($event, index)">{{ tab.label }}</button>
  </div>
</template>

<style scoped>
.admin-workspace-tabs { display: flex; gap: 4px; max-width: 100%; overflow-x: auto; padding: 5px; margin-bottom: 20px; border: 1px solid var(--admin-border); border-radius: 16px; background: var(--admin-neutral-bg); }
button { flex: 0 0 auto; min-height: 40px; padding: 8px 16px; border: 1px solid transparent; border-radius: 12px; color: var(--admin-muted); background: transparent; font: 600 13px / 1.4 var(--admin-font); white-space: nowrap; }
button:hover { color: var(--admin-text); background: var(--admin-hover); }
button[aria-selected="true"] { color: var(--admin-text); border-color: var(--admin-border); background: var(--admin-surface); box-shadow: var(--admin-shadow-card); }
button:disabled { opacity: .6; cursor: not-allowed; }
@media (pointer: coarse) { button { min-height: 44px; } }
</style>
