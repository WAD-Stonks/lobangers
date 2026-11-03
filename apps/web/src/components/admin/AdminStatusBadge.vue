<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
  label?: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}>()
const text = computed(() => props.label ?? props.status.replaceAll('_', ' ').toLowerCase())
const tone = computed(() => {
  if (props.tone) return props.tone
  if (['APPROVED', 'PUBLISHED', 'ACTIVE', 'SUCCEEDED', 'SUCCESS', 'VISIBLE'].includes(props.status)) return 'success'
  if (['PENDING', 'NEEDS_REVIEW', 'SCHEDULED'].includes(props.status)) return 'warning'
  if (['REJECTED', 'FAILED', 'SUSPENDED', 'HIDDEN', 'STOPPED'].includes(props.status)) return 'danger'
  if (props.status === 'LIVE') return 'info'
  return 'neutral'
})
</script>

<template>
  <span class="admin-status-badge" :data-tone="tone">{{ text }}</span>
</template>

<style scoped>
.admin-status-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid var(--admin-neutral-status-border);
  border-radius: 999px;
  color: var(--admin-neutral-status-ink);
  background: var(--admin-neutral-status-bg);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  text-transform: capitalize;
}
[data-tone="success"] { color: var(--admin-success-ink); background: var(--admin-success-bg); border-color: var(--admin-success-border); }
[data-tone="warning"] { color: var(--admin-warning-ink); background: var(--admin-warning-bg); border-color: var(--admin-accent-border); }
[data-tone="danger"] { color: var(--admin-danger-ink); background: var(--admin-danger-bg); border-color: var(--admin-danger-border); }
[data-tone="info"] { color: var(--tag-info-ink); background: var(--tag-info-bg); border-color: transparent; }
</style>
