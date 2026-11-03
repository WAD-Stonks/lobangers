<script setup lang="ts">
import AdminWorkspaceTabs from '@web/components/admin/AdminWorkspaceTabs.vue'

defineProps<{
  modelValue: string
  tabs: readonly { id: string; label: string }[]
  idPrefix: string
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <AdminWorkspaceTabs v-bind="$props" class="workspace-tabs" @update:model-value="emit('update:modelValue', $event)" />
</template>
