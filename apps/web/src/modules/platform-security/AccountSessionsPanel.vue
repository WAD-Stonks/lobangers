<script setup lang="ts">
import AppSelect from '@web/components/AppSelect.vue'
import { withLeading } from '@web/components/select-options'
import { formatDateTime } from '@web/lib/format'
import type { SecuritySessions } from '@web/modules/platform-security/use-account-security'
import { computed } from 'vue'

const props = defineProps<{
  page: SecuritySessions
  selectedSession: string
  disabled: boolean
  loadingMore: boolean
}>()
defineEmits<{ 'update:selectedSession': [string]; more: [] }>()
const sessionOptions = computed(() =>
  withLeading(
    { value: '', label: 'Choose a session' },
    props.page.items.map((session) => ({ value: session.id, label: `${session.deviceLabel} · ${session.id}` })),
  ),
)
</script>
<template>
  <section aria-label="Account sessions" class="security-sessions mt-3">
    <h4 class="h6">Sessions</h4>
    <p class="small text-muted">Session dates are in Singapore time (SGT). No session credentials are displayed.</p>
    <p v-if="!page.items.length">{{ page.nextCursor ? 'No sessions on this page. Load more to continue.' : 'No sessions returned.' }}</p>
    <ul v-else class="list-unstyled mb-3">
      <li v-for="session in page.items" :key="session.id" class="border-bottom py-2">
        <strong>{{ session.deviceLabel }}</strong>
        <div class="small">Session ID: {{ session.id }}</div>
        <div class="small">Created: <time :datetime="session.createdAt">{{ formatDateTime(session.createdAt) }}</time></div>
        <div class="small">Expires: <time :datetime="session.expiresAt">{{ formatDateTime(session.expiresAt) }}</time></div>
      </li>
    </ul>
    <button v-if="page.nextCursor" type="button" data-testid="security-more-sessions" class="btn btn-outline-secondary btn-sm mb-3" :disabled="disabled || loadingMore" @click="$emit('more')">{{ loadingMore ? 'Loading sessions…' : 'Load more sessions' }}</button>
    <label class="form-label d-block">Session to revoke
      <AppSelect data-testid="security-session" class="form-select" :model-value="selectedSession" :options="sessionOptions" :disabled="disabled || loadingMore" @update:model-value="$emit('update:selectedSession', $event)" />
    </label>
  </section>
</template>
