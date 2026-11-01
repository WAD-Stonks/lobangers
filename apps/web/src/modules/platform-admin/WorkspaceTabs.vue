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
  <div role="tablist" :aria-label="label" class="workspace-tabs">
    <button v-for="(tab, index) in tabs" :id="`${idPrefix}-tab-${tab.id}`" :key="tab.id"
      type="button" role="tab" :aria-selected="modelValue === tab.id"
      :aria-controls="`${idPrefix}-panel-${tab.id}`" :tabindex="modelValue === tab.id ? 0 : -1"
      :disabled="disabled" @click="choose(tab.id)" @keydown="navigate($event, index)">{{ tab.label }}</button>
  </div>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>
