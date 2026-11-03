<script setup lang="ts">
withDefaults(defineProps<{ selected: boolean; label: string; detailLabel?: string; disabled?: boolean }>(), { detailLabel: 'Selected record' })
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="admin-record-workspace" :class="{ 'has-selection': selected }">
    <section class="admin-record-workspace-list" :aria-label="label"><slot name="list" /></section>
    <section class="admin-record-workspace-detail" :aria-label="detailLabel">
      <button v-if="selected" type="button" class="btn btn-outline-secondary admin-workspace-back" :disabled="disabled" @click="emit('close')">← Back to results</button>
      <slot name="detail" />
    </section>
  </div>
</template>

<style scoped>
.admin-record-workspace { display: grid; grid-template-columns: minmax(260px, .85fr) minmax(0, 1.65fr); align-items: start; gap: 20px; min-width: 0; }
.admin-record-workspace-list, .admin-record-workspace-detail { min-width: 0; border: 1px solid var(--admin-border); border-radius: 20px; background: var(--admin-surface); overflow-wrap: anywhere; }
.admin-record-workspace-list { max-height: calc(100dvh - 240px); min-height: 240px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; }
.admin-record-workspace-detail { padding: 24px; }
.admin-workspace-back { display: none; margin-bottom: 20px; }
@media (max-width: 991.98px) {
  .admin-record-workspace { grid-template-columns: minmax(0, 1fr); }
  .admin-record-workspace-list { max-height: none; min-height: 0; }
  .admin-record-workspace-detail { padding: 20px 16px; }
  .admin-record-workspace:not(.has-selection) .admin-record-workspace-detail,
  .admin-record-workspace.has-selection .admin-record-workspace-list { display: none; }
  .admin-workspace-back { display: inline-flex; }
}
</style>
