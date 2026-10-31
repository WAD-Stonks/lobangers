<script setup lang="ts">
import type { AdminOverviewResponse } from '@broke-oclock/contracts/platform-admin'
import AdminShell from '@web/components/admin/AdminShell.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onMounted, onUnmounted, ref } from 'vue'

const access = ref('loading')
const overview = ref<AdminOverviewResponse | null>(null)
const sessionRefreshKey = ref(0)
const fence = createAdminReadFence()
const nativeFence = createAdminReadFence()
const dateFormatter = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Singapore',
})
const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unavailable' : dateFormatter.format(date)
}
const statusTone = (status: string) => {
  if (status === 'SUCCEEDED' || status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'neutral'
}
const logoutStarting = (event: Event) => {
  if ((event.target as Element)?.closest('[data-testid="admin-sign-out"]')) nativeFence.invalidate()
}
const close = () => { fence.invalidate(); access.value = 'closed'; overview.value = null }
const anonymous = () => { close(); access.value = 'unauthorized' }
const reload = async () => {
  close()
  const ticket = fence.begin()
  access.value = 'loading'
  const probe = nativeFence.begin()
  try {
    const identity = await authClient.getSession({ query: { disableCookieCache: true } })
    if (!nativeFence.current(probe)) return
    if (identity.error) { close(); return }
    if (!identity.data?.user) { confirmAdminIdentity(null); if (access.value === 'closed' || access.value === 'loading') anonymous(); return }
    if (!fence.current(ticket)) return
    const data = await api.platformAdmin.overview()
    if (!fence.current(ticket)) return
    overview.value = data
    access.value = 'allowed'
  } catch (failure) {
    if (!fence.current(ticket)) return
    const code = errorCode(failure)
    close()
    access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}
const signedIn = () => { sessionRefreshKey.value++; void reload() }
onMounted(reload)
onUnmounted(() => { fence.dispose(); nativeFence.dispose() })
</script>

<template>
  <AdminShell @click.capture="logoutStarting" title="Admin overview" :refresh-key="sessionRefreshKey" @closing="close" @signed-out="anonymous" @access-reload="reload">
    <div v-if="access === 'allowed' || access === 'loading'" class="overview-toolbar">
      <p class="small text-secondary mb-0">
        <template v-if="overview">Last updated <time :datetime="overview.generatedAt">{{ formatDate(overview.generatedAt) }}</time> (SGT)</template>
        <template v-else>Checking the latest overview.</template>
      </p>
      <button data-testid="overview-refresh" type="button" class="btn btn-outline-primary" :disabled="access === 'loading'" @click="reload">
        {{ access === 'loading' ? 'Refreshing…' : 'Refresh overview' }}
      </button>
    </div>
    <p v-if="access === 'loading'" role="status">Loading admin overview…</p>
    <SharedSignIn v-else-if="access === 'unauthorized'" title="Sign in to view administration" destination="/admin" @signed-in="signedIn" />
    <p v-else-if="access === 'forbidden'" role="alert">You do not have permission to view administration.</p>
    <p v-else-if="access === 'closed'" role="status">Access is closed. Use the session controls to retry or recheck.</p>
    <div v-else-if="access === 'error'" role="alert">
      <p>Unable to load admin overview. Counts are unavailable.</p>
      <button type="button" class="btn btn-outline-primary" @click="reload">Retry overview</button>
    </div>
    <template v-else-if="overview">
      <div class="admin-overview-panels overview-panels">
      <section class="admin-work-panel" aria-labelledby="work-title">
        <h2 id="work-title" class="h4">Work awaiting review</h2>
        <ul class="overview-summary">
          <li class="card"><a class="overview-summary-link" href="/admin/accounts?requestStatus=PENDING#merchant-requests"><span>Pending merchant requests: </span><strong>{{ overview.counts.pendingMerchantRequests }}</strong><span class="overview-card-hint">Review merchant access →</span></a></li>
          <li class="card"><a class="overview-summary-link" href="/admin/ingestion?status=PENDING#queue-title"><span>Pending imported drafts: </span><strong>{{ overview.counts.pendingImportedDrafts }}</strong><span class="overview-card-hint">Review imported deals →</span></a></li>
          <li class="card overview-summary-static"><span>Failed imported posts: </span><strong>{{ overview.counts.failedImportedPosts }}</strong><span class="overview-card-hint">Stored posts requiring investigation</span></li>
        </ul>
        <p class="small mb-0">Failures count imported posts, not ingestion runs.</p>
      </section>
      <section class="card p-3 mb-3 admin-runs-panel" aria-labelledby="overview-runs-title">
        <h2 id="overview-runs-title" class="h4">Recent ingestion runs</h2>
        <p><a href="/admin/ingestion#runs-title">View ingestion run history</a></p>
        <p v-if="!overview.recentRuns.length" class="text-secondary mb-0">No ingestion runs yet.</p>
        <div v-else class="table-responsive overview-runs-scroll" role="region" aria-label="Recent ingestion runs" tabindex="0">
          <table class="table mb-0 overview-runs-table">
            <caption class="visually-hidden">Latest {{ overview.recentRuns.length }} ingestion runs. Dates are in Singapore time (SGT). Results count imported posts.</caption>
            <thead><tr><th scope="col">Source / run</th><th scope="col">Status</th><th scope="col">Started (SGT)</th><th scope="col">Finished (SGT)</th><th scope="col">Results</th></tr></thead>
            <tbody>
              <tr v-for="run in overview.recentRuns" :key="run.id">
                <th scope="row"><span class="overview-source">{{ run.sourceName }}</span><small class="overview-run-id">{{ run.id }}</small></th>
                <td><span class="overview-status" :data-tone="statusTone(run.status)">{{ run.status.replaceAll('_', ' ') }}</span><small v-if="run.errorCode" class="d-block text-danger mt-2">Error: {{ run.errorCode }}</small></td>
                <td><time :datetime="run.startedAt">{{ formatDate(run.startedAt) }}</time></td>
                <td><time v-if="run.finishedAt" :datetime="run.finishedAt">{{ formatDate(run.finishedAt) }}</time><span v-else class="text-secondary">Not finished</span></td>
                <td><span class="d-block">Fetched {{ run.fetchedCount }}</span><span class="d-block">Created {{ run.createdCount }} · Updated {{ run.updatedCount }}</span><span :class="{ 'text-danger': run.failedCount > 0 }">Failed posts {{ run.failedCount }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="card p-3 mb-3 admin-readiness" aria-labelledby="readiness-title">
        <h2 id="readiness-title" class="h4">Configuration readiness</h2>
        <p>Configured and wired does not establish live provider acceptance.</p>
        <dl>
          <dt>Google sign-in</dt><dd>{{ overview.readiness.googleConfigured ? 'Configured and wired' : 'Not configured' }}</dd>
          <dt>Email authentication</dt><dd>{{ overview.readiness.emailConfigured ? 'Configured and wired' : 'Not configured' }}</dd>
          <dt>OneMap</dt><dd>{{ overview.readiness.oneMapConfigured ? 'Configured and wired' : 'Not configured' }}</dd>
          <dt>Ingestion operator opt-in</dt><dd>{{ overview.readiness.ingestionOptIn ? 'Enabled' : 'Disabled' }}</dd>
          <dt>Operator reuse attestation, not publisher permission</dt><dd>{{ overview.readiness.reuseAttested ? 'Recorded' : 'Not recorded' }}</dd>
          <dt>Source record</dt><dd>{{ overview.readiness.sourceRecordEnabled ? 'Enabled' : 'Disabled' }}</dd>
          <dt>Source identity</dt><dd>{{ overview.readiness.sourceIdentityValid ? 'Valid' : 'Invalid or missing' }}</dd>
          <dt>Import gate</dt><dd>{{ overview.readiness.importAllowed ? 'Allowed by configuration gates' : 'Blocked by configuration gates' }}</dd>
          <dt>Live provider acceptance</dt><dd>{{ overview.readiness.liveProviderAcceptance }}</dd>
        </dl>
      </section>
      </div>
    </template>
  </AdminShell>
</template>

<style scoped>
.overview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}
.admin-overview-panels.overview-panels {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "work" "runs" "readiness";
}
.overview-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 0;
  margin: 16px 0;
  list-style: none;
}
.overview-summary-link,
.overview-summary-static {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 20px;
  height: 100%;
  text-decoration: none;
}
.overview-summary-link:hover {
  background: #fff9e5;
  border-radius: 8px;
}
.overview-summary strong {
  font-size: 32px;
  line-height: 1.2;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.overview-card-hint,
.overview-run-id {
  color: var(--admin-muted);
  font-size: 12px;
}
.overview-card-hint { margin-top: auto; }
.overview-runs-table { min-width: 700px; }
.overview-runs-table td { font-variant-numeric: tabular-nums; }
.overview-source,
.overview-run-id { display: block; }
.overview-run-id { margin-top: 4px; overflow-wrap: anywhere; }
.overview-status {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  background: #edf0f4;
  color: #465366;
  font-size: 11px;
  font-weight: 600;
}
.overview-status[data-tone="success"] { background: #e7f3eb; color: #285c3b; }
.overview-status[data-tone="danger"] { background: #fff0ed; color: #912d27; }
.overview-runs-scroll:focus-visible { outline: 2px solid #465c82; outline-offset: 3px; }
@media (max-width: 991.98px) {
  .overview-summary { grid-template-columns: minmax(0, 1fr); }
}
</style>
