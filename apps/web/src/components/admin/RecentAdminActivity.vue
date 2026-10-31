<script setup lang="ts">
import type { PlatformAuditEntry } from '@broke-oclock/contracts/platform-admin'
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const entries = ref<PlatformAuditEntry[]>([])
const loading = ref(false)
const failed = ref(false)
const fence = createAdminReadFence()
const dateFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short',
})
const label = (value: string) => {
  const words = value.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const formatDate = (value: string) => dateFormatter.format(new Date(value))
const load = async () => {
  if (loading.value) return
  const ticket = fence.begin()
  entries.value = []
  loading.value = true
  failed.value = false
  try {
    const page = await api.adminAudit.list({ limit: 5 })
    if (fence.current(ticket)) entries.value = page.items.slice(0, 5)
  } catch (error) {
    if (!fence.current(ticket)) return
    const code = errorCode(error)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    else failed.value = true
  } finally {
    if (fence.current(ticket)) loading.value = false
  }
}
onMounted(load)
onUnmounted(() => fence.dispose())
</script>

<template>
  <section class="card recent-admin-activity" aria-labelledby="recent-activity-title" :aria-busy="loading">
    <header class="activity-heading">
      <div>
        <h2 id="recent-activity-title">Recent admin activity</h2>
        <p class="small text-secondary mb-0">Latest five recorded platform actions, newest first. Times are in Singapore time (SGT).</p>
      </div>
      <button type="button" class="btn btn-outline-primary" data-testid="refresh-admin-activity" :disabled="loading" @click="load">{{ loading ? 'Refreshing…' : 'Refresh activity' }}</button>
    </header>
    <p v-if="loading" class="mt-3" role="status">Loading recent activity…</p>
    <div v-else-if="failed" class="mt-3" role="alert">
      <p>Recent activity is unavailable. The rest of the overview is still available.</p>
      <button type="button" class="btn btn-outline-primary" @click="load">Retry activity</button>
    </div>
    <p v-else-if="!entries.length" class="activity-empty">No recorded activity yet.</p>
    <ol v-else class="activity-feed">
      <li v-for="entry in entries" :key="entry.id" data-testid="recent-activity-entry">
        <span class="activity-icon" aria-hidden="true"><AdminIcon name="audit" /></span>
        <div class="activity-content">
          <div class="activity-row-heading"><h3>{{ label(entry.action) }}</h3><time :datetime="entry.createdAt">{{ formatDate(entry.createdAt) }} (SGT)</time></div>
          <p class="activity-actor">By {{ entry.actorName }}</p>
          <p v-if="entry.subjectId || entry.targetUserId" class="activity-target">{{ entry.subjectType ? label(entry.subjectType) : entry.targetUserId ? 'Account' : 'Record' }} · {{ entry.subjectId ?? entry.targetUserId }}</p>
          <details class="activity-details">
            <summary>View recorded details</summary>
            <p class="activity-note">{{ entry.note }}</p>
            <p v-if="entry.roleBefore || entry.roleAfter">Role: {{ entry.roleBefore ?? 'Not recorded' }} → {{ entry.roleAfter ?? 'Not recorded' }}</p>
            <p v-if="entry.venueId">Outlet: {{ entry.venueId }}</p>
            <p>Actor ID: {{ entry.actorId }}</p>
            <p>Audit entry: {{ entry.id }} · {{ entry.action }}</p>
          </details>
        </div>
      </li>
    </ol>
    <footer class="activity-footer"><a href="/admin/audit">View full audit history →</a></footer>
  </section>
</template>

<style scoped>
.recent-admin-activity { padding: 24px; }
.activity-heading, .activity-row-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; }
.activity-heading { align-items: start; gap: 16px; }
.activity-heading > div { flex: 1 1 300px; }
.activity-heading h2 { letter-spacing: -0.02em; }
.activity-heading h2::before { display: inline-block; content: ""; width: 4px; height: 14px; margin-right: 9px; border-radius: 3px; background: var(--admin-accent); vertical-align: -1px; }
.activity-feed { list-style: none; padding: 0; margin: 24px 0 0; }
.activity-feed > li { display: flex; align-items: start; gap: 14px; padding: 20px 0; border-top: 1px solid #edf0f3; }
.activity-icon { display: grid; place-items: center; flex: 0 0 36px; height: 36px; background: #fff8dc; color: #826517; border: 1px solid #f1e6b9; border-radius: 10px; }
.activity-content { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.activity-row-heading h3 { margin: 0; font-size: 14px; }
.activity-row-heading time { color: var(--admin-muted); font-size: 12px; }
.activity-actor { margin: 6px 0; font-size: 13px; }
.activity-target { color: var(--admin-muted); font-size: 12px; margin: 0 0 8px; }
.activity-details { font-size: 12px; }
.activity-details summary { width: fit-content; color: #535e6e; cursor: pointer; text-underline-offset: 3px; }
.activity-details summary:hover { text-decoration: underline; }
.activity-details p { margin: 10px 0 0; }
.activity-note { white-space: pre-wrap; }
.activity-empty { color: var(--admin-muted); padding: 24px 0 0; }
.activity-footer { border-top: 1px solid #edf0f3; padding-top: 16px; margin-top: 8px; font-size: 12px; font-weight: 600; }
@media (max-width: 767.98px) {
  .recent-admin-activity { padding: 20px; }
  .activity-feed > li { gap: 10px; }
}
</style>
