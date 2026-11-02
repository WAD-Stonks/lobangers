<script setup lang="ts">
import type { AdminOverviewResponse } from '@broke-oclock/contracts/platform-admin'
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import AdminShell from '@web/components/admin/AdminShell.vue'
import RecentAdminActivity from '@web/components/admin/RecentAdminActivity.vue'
import UserRegistrationAnalytics from '@web/components/admin/UserRegistrationAnalytics.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const access = ref('loading')
const overview = ref<AdminOverviewResponse | null>(null)
const sessionRefreshKey = ref(0)
const runsExpanded = ref(false)
const readinessExpanded = ref(false)
const attentionItems = computed(() => {
  if (!overview.value) return []
  const counts = overview.value.counts
  return [
    { count: counts.failedImportedPosts, label: 'Imported posts need investigation', href: '/admin/ingestion#failed-posts', action: 'Investigate posts' },
    { count: counts.pendingMerchantRequests, label: 'Merchant requests await a decision', href: '/admin/accounts?requestStatus=PENDING#merchant-requests', action: 'Review requests' },
    { count: counts.pendingImportedDrafts, label: 'Imported drafts await review', href: '/admin/ingestion?status=PENDING#queue-title', action: 'Review drafts' },
    { count: counts.pendingFlashDrops, label: 'Flash drops waiting for review', href: '/admin/flash-drops', action: 'Review flash drops' },
    { count: counts.liveFlashDrops, label: 'Flash drops live now', href: '/admin/flash-drops?view=live', action: 'Watch live drops' },
  ].filter(item => item.count > 0)
})
const quickActions = [
  { href: '/admin/deals', label: 'Manage deals', description: 'Review and correct deal listings.', icon: 'deals' },
  { href: '/admin/flash-drops', label: 'Review flash drops', description: 'Check radius, codes and overlaps.', icon: 'flash' },
  { href: '/admin/accounts', label: 'Manage accounts', description: 'Review roles and merchant access.', icon: 'accounts' },
  { href: '/admin/moderation', label: 'Review reports', description: 'Investigate deal and comment reports.', icon: 'moderation' },
]
const chartSeries = [
  { key: 'createdCount', label: 'Created', tone: 'created' },
  { key: 'updatedCount', label: 'Updated', tone: 'updated' },
  { key: 'failedCount', label: 'Failed posts', tone: 'failed' },
] as const
const chartMetric = ref<'all' | typeof chartSeries[number]['key']>('all')
const visibleSeries = computed(() => chartSeries.filter(series => chartMetric.value === 'all' || series.key === chartMetric.value))
const chartMaximum = computed(() => Math.max(1, ...(overview.value?.recentRuns ?? []).flatMap(run => visibleSeries.value.map(series => run[series.key]))))
const barWidth = (count: number) => `${Math.max(0, count) / chartMaximum.value * 100}%`
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
const protectedSectionDenied = (code: 'UNAUTHORIZED' | 'FORBIDDEN') => {
  close()
  access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : 'forbidden'
}
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
  <AdminShell class="admin-overview" @click.capture="logoutStarting" title="Admin overview" :refresh-key="sessionRefreshKey" @closing="close" @signed-out="anonymous" @access-reload="reload">
    <div v-if="access === 'allowed' || access === 'loading'" class="overview-toolbar">
      <div class="overview-introduction">
      <p class="overview-description">Review pending work and track registrations and imports.</p>
      <p class="small text-secondary mb-0">
        <template v-if="overview">Last updated <time :datetime="overview.generatedAt">{{ formatDate(overview.generatedAt) }}</time> (SGT)</template>
        <template v-else>Checking the latest overview.</template>
      </p>
      </div>
      <button data-testid="overview-refresh" type="button" class="btn btn-outline-primary" :disabled="access === 'loading'" @click="reload">
        <span aria-hidden="true" class="overview-refresh-symbol">↻</span>{{ access === 'loading' ? 'Refreshing…' : 'Refresh overview' }}
      </button>
    </div>
    <TicketLoading v-if="access === 'loading'" label="Loading admin overview…" />
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
          <li class="card"><a class="overview-summary-link" href="/admin/accounts?requestStatus=PENDING#merchant-requests"><span class="overview-metric-label"><span>Pending merchant requests: </span><span class="overview-metric-icon"><AdminIcon name="accounts" /></span></span><strong>{{ overview.counts.pendingMerchantRequests }}</strong><span class="overview-card-hint">Review merchant access →</span></a></li>
          <li class="card"><a class="overview-summary-link" href="/admin/ingestion?status=PENDING#queue-title"><span class="overview-metric-label"><span>Pending imported drafts: </span><span class="overview-metric-icon"><AdminIcon name="deals" /></span></span><strong>{{ overview.counts.pendingImportedDrafts }}</strong><span class="overview-card-hint">Review imported deals →</span></a></li>
          <li class="card overview-summary-static"><span class="overview-metric-label"><span>Failed imported posts: </span><span class="overview-metric-icon overview-metric-icon--neutral"><AdminIcon name="ingestion" /></span></span><strong>{{ overview.counts.failedImportedPosts }}</strong><span class="overview-card-hint">Stored posts requiring investigation</span></li>
          <li class="card"><a class="overview-summary-link" href="/admin/flash-drops"><span class="overview-metric-label"><span>Flash drops to review: </span><span class="overview-metric-icon overview-metric-icon--flash"><AdminIcon name="flash" /></span></span><strong>{{ overview.counts.pendingFlashDrops }}</strong><span class="overview-card-hint">Review flash drops →</span></a></li>
        </ul>
        <p class="small mb-0">Failures count imported posts, not ingestion runs.</p>
      </section>
      <UserRegistrationAnalytics class="overview-registrations" @denied="protectedSectionDenied" />
      <div class="overview-next-steps">
        <section class="card overview-attention" aria-labelledby="attention-title">
          <h2 id="attention-title">Attention needed</h2>
          <p class="small text-secondary">Open work in the current snapshot.</p>
          <ul v-if="attentionItems.length" class="overview-attention-list">
            <li v-for="item in attentionItems" :key="item.href">
              <div><strong>{{ item.count }}</strong> {{ item.label }}</div>
              <a :href="item.href">{{ item.action }} →</a>
            </li>
          </ul>
          <p v-else class="overview-queue-clear mb-0">No pending merchant requests, imported drafts, flash drops or failed imported posts in this snapshot.</p>
        </section>
        <nav class="card overview-shortcuts" aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title">Quick actions</h2>
          <ul class="overview-shortcut-list">
            <li v-for="action in quickActions" :key="action.href">
              <a :href="action.href"><span class="overview-shortcut-icon" aria-hidden="true"><AdminIcon :name="action.icon" /></span><span class="overview-shortcut-copy"><strong>{{ action.label }} →</strong><span>{{ action.description }}</span></span></a>
            </li>
          </ul>
        </nav>
      </div>
      <section class="card overview-import-chart" aria-labelledby="import-chart-title">
        <div class="overview-chart-heading">
          <div>
            <h2 id="import-chart-title">Latest import runs</h2>
            <p class="small text-secondary mb-0">Created, updated and failed post counts from up to 10 recent runs, newest first. This is a run comparison, not a daily trend.</p>
          </div>
          <label v-if="overview.recentRuns.length" class="overview-chart-filter">Show results
            <select v-model="chartMetric" class="form-select" data-testid="import-chart-metric">
              <option value="all">All results</option>
              <option v-for="series in chartSeries" :key="series.key" :value="series.key">{{ series.label }}</option>
            </select>
          </label>
        </div>
        <p v-if="!overview.recentRuns.length" class="text-secondary mt-3 mb-0">Import results will appear here after a run is recorded.</p>
        <template v-else>
          <ul class="overview-chart-legend" aria-label="Chart legend">
            <li v-for="series in visibleSeries" :key="series.key"><span class="overview-chart-swatch" :data-series="series.tone" aria-hidden="true"></span>{{ series.label }}</li>
          </ul>
          <p class="small text-secondary">Each full-width bar represents {{ chartMaximum }} posts. All displayed bars share this scale. Dates are in SGT.</p>
          <ol class="overview-chart-runs">
            <li v-for="run in overview.recentRuns" :key="run.id" class="overview-chart-run">
              <div class="overview-chart-run-label"><strong>{{ run.sourceName }}</strong><time :datetime="run.startedAt">{{ formatDate(run.startedAt) }}</time><small translate="no">{{ run.id }}</small></div>
              <div class="overview-chart-series">
                <div v-for="series in visibleSeries" :key="series.key" class="overview-chart-bar-row">
                  <span class="overview-chart-bar-label">{{ series.label }}</span>
                  <div class="overview-chart-track" aria-hidden="true"><span class="overview-chart-bar" :data-series="series.tone" :style="{ width: barWidth(run[series.key]) }"></span></div>
                  <strong class="overview-chart-count">{{ run[series.key] }}</strong>
                </div>
              </div>
            </li>
          </ol>
        </template>
      </section>
      <section class="card admin-runs-panel" aria-labelledby="overview-runs-title">
        <header class="overview-collapse-heading">
          <h2 id="overview-runs-title" class="h4">Recent ingestion runs</h2>
          <button type="button" class="btn btn-outline-secondary overview-collapse-toggle" :aria-expanded="runsExpanded" aria-controls="overview-runs-content" @click="runsExpanded = !runsExpanded">
            {{ runsExpanded ? 'Hide details' : 'Show details' }}<span class="visually-hidden"> of recent ingestion runs</span><AdminIcon name="chevron" />
          </button>
        </header>
        <p class="small text-secondary mb-0">{{ overview.recentRuns.length ? `${overview.recentRuns.length} recent runs available. Expand for timestamps, status and post counts.` : 'No ingestion runs yet.' }}</p>
        <div id="overview-runs-content" :hidden="!runsExpanded" class="overview-collapse-content">
        <p><a href="/admin/ingestion#runs-title">View ingestion run history</a></p>
        <!-- biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and horizontally scroll the table on small screens. -->
        <section v-if="overview.recentRuns.length" class="table-responsive overview-runs-scroll" aria-label="Recent ingestion runs table" tabindex="0">
          <table class="table mb-0 overview-runs-table">
            <caption class="visually-hidden">Latest {{ overview.recentRuns.length }} ingestion runs. Dates are in Singapore time (SGT). Results count imported posts.</caption>
            <thead><tr><th scope="col">Source / run</th><th scope="col">Status</th><th scope="col">Started (SGT)</th><th scope="col">Finished (SGT)</th><th scope="col">Results</th></tr></thead>
            <tbody>
              <tr v-for="run in overview.recentRuns" :key="run.id">
                <th scope="row"><span class="overview-source">{{ run.sourceName }}</span><small class="overview-run-id" translate="no">{{ run.id }}</small></th>
                <td><span class="overview-status" :data-tone="statusTone(run.status)">{{ run.status.replaceAll('_', ' ') }}</span><small v-if="run.errorCode" class="d-block text-danger mt-2">Error: {{ run.errorCode }}</small></td>
                <td><time :datetime="run.startedAt">{{ formatDate(run.startedAt) }}</time></td>
                <td><time v-if="run.finishedAt" :datetime="run.finishedAt">{{ formatDate(run.finishedAt) }}</time><span v-else class="text-secondary">Not finished</span></td>
                <td><span class="d-block">Fetched {{ run.fetchedCount }}</span><span class="d-block">Created {{ run.createdCount }} · Updated {{ run.updatedCount }}</span><span :class="{ 'text-danger': run.failedCount > 0 }">Failed posts {{ run.failedCount }}</span></td>
              </tr>
            </tbody>
          </table>
        </section>
        </div>
      </section>
      <RecentAdminActivity class="overview-activity" @denied="protectedSectionDenied" />
      <section class="card admin-readiness" aria-labelledby="readiness-title">
        <header class="overview-collapse-heading">
          <h2 id="readiness-title" class="h4">Configuration readiness</h2>
          <button type="button" class="btn btn-outline-secondary overview-collapse-toggle" :aria-expanded="readinessExpanded" aria-controls="overview-readiness-content" @click="readinessExpanded = !readinessExpanded">
            {{ readinessExpanded ? 'Hide details' : 'Show details' }}<span class="visually-hidden"> of configuration readiness</span><AdminIcon name="chevron" />
          </button>
        </header>
        <p class="mb-0">Configured and wired does not establish live provider acceptance.</p>
        <div id="overview-readiness-content" :hidden="!readinessExpanded" class="overview-collapse-content">
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
        </div>
      </section>
      </div>
    </template>
  </AdminShell>
</template>

<style scoped>
.admin-overview {
  --admin-bg: var(--admin-overview-bg);
  --overview-radius: 14px;
}
.admin-overview :deep(.admin-heading) { margin-bottom: 12px; }
.overview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 32px;
}
.overview-description { margin: 0 0 6px; color: var(--admin-secondary-text); font-size: 14px; }
.overview-toolbar .btn { display: inline-flex; align-items: center; gap: 8px; background: var(--admin-surface); }
.overview-refresh-symbol { font-size: 20px; line-height: 1; }
.admin-overview-panels.overview-panels {
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr);
  grid-template-areas: "work work" "registrations next" "chart chart" "runs runs" "activity activity" "readiness readiness";
  gap: 24px;
}
.overview-panels :where(.card) {
  border-radius: var(--overview-radius);
  border-color: var(--admin-card-border);
  box-shadow: var(--admin-shadow-card);
}
.overview-panels > :where(.card),
.overview-next-steps > :where(.card) { padding: 24px; margin-bottom: 0; }
.overview-panels :where(h2) { margin-bottom: 8px; letter-spacing: -0.02em; }
.overview-panels :where(h2)::before {
  display: inline-block;
  content: "";
  width: 4px;
  height: 14px;
  margin-right: 9px;
  border-radius: 3px;
  background: var(--admin-accent);
  vertical-align: -1px;
}
.admin-work-panel > .small { color: var(--admin-muted); }
.overview-registrations { grid-area: registrations; }
.overview-activity { grid-area: activity; }
.overview-collapse-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.overview-collapse-heading h2 { margin: 0; }
.overview-collapse-toggle { display: inline-flex; align-items: center; gap: 8px; }
.overview-collapse-toggle[aria-expanded="true"] :deep(.admin-icon) { transform: rotate(180deg); }
.overview-collapse-content { margin-top: 20px; }
.overview-next-steps {
  grid-area: next;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.overview-attention-list,
.overview-shortcut-list,
.overview-chart-legend,
.overview-chart-runs { list-style: none; padding: 0; margin: 0; }
.overview-attention-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding-block: 16px;
  border-top: 1px solid var(--admin-border);
}
.overview-attention-list strong { display: inline-block; min-width: 28px; padding: 2px 7px; margin-right: 4px; border-radius: 6px; background: var(--admin-warning-bg); color: var(--admin-warning-ink); text-align: center; font-variant-numeric: tabular-nums; }
.overview-attention-list a { font-size: 12px; font-weight: 600; }
.overview-queue-clear { padding: 16px; border: 1px solid var(--admin-success-border); border-radius: 8px; color: var(--admin-success-ink); background: var(--admin-success-wash); }
.overview-shortcut-list :where(li + li) { border-top: 1px solid var(--admin-border); }
.overview-shortcut-list a { display: flex; align-items: center; gap: 12px; padding: 14px 8px; margin-inline: -8px; border-radius: 8px; text-decoration: none; transition: background-color 150ms ease; }
.overview-shortcut-list a:hover { background: var(--admin-accent-hover-bg); }
.overview-shortcut-icon { display: grid; place-items: center; flex: 0 0 36px; height: 36px; border: 1px solid var(--admin-line); border-radius: 10px; background: var(--admin-subtle-bg); color: var(--admin-icon-ink); }
.overview-shortcut-copy { min-width: 0; }
.overview-shortcut-copy > span { display: block; margin-top: 3px; color: var(--admin-muted); font-size: 12px; }
.overview-import-chart { grid-area: chart; }
.overview-chart-heading { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; }
.overview-chart-heading > div { flex: 1 1 300px; }
.overview-chart-filter { display: grid; align-content: start; gap: 6px; min-width: 150px; color: var(--admin-muted); font-size: 12px; }
.overview-chart-legend { display: flex; flex-wrap: wrap; gap: 20px; margin: 24px 0 12px; }
.overview-chart-legend li { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.overview-chart-swatch { width: 9px; height: 9px; border-radius: 50%; }
[data-series="created"] { background: var(--admin-chart-created); }
[data-series="updated"] { background: var(--admin-chart-updated); }
[data-series="failed"] { background: var(--admin-chart-failed); }
.overview-chart-run { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); gap: 24px; padding: 20px 0; border-top: 1px solid var(--admin-line); }
.overview-chart-run-label { display: grid; align-content: start; gap: 4px; }
.overview-chart-run-label time,
.overview-chart-run-label small { font-size: 12px; color: var(--admin-muted); overflow-wrap: anywhere; }
.overview-chart-series { display: grid; align-content: center; gap: 8px; }
.overview-chart-bar-row { display: grid; grid-template-columns: 78px minmax(0, 1fr) 44px; align-items: center; gap: 8px; font-size: 12px; }
.overview-chart-track { height: 10px; background: var(--admin-track); border-radius: 6px; overflow: hidden; }
.overview-chart-bar { display: block; height: 100%; border-radius: 6px; }
.overview-chart-count { text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.overview-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  padding: 0;
  margin: 16px 0 12px;
  list-style: none;
}
.overview-summary-link,
.overview-summary-static {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 24px;
  height: 100%;
  text-decoration: none;
}
.overview-summary-link:hover {
  background: var(--admin-accent-hover-bg);
  border-radius: var(--overview-radius);
}
.overview-summary > .card { overflow: hidden; transition: border-color 150ms ease, box-shadow 150ms ease; }
.overview-summary > .card:has(a:hover) { border-color: var(--admin-accent-border-strong); box-shadow: var(--admin-shadow-lift); }
.overview-metric-label { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; color: var(--admin-muted); font-size: 13px; }
.overview-metric-icon { display: grid; place-items: center; flex: 0 0 38px; height: 38px; border: 1px solid var(--admin-accent-border); border-radius: 11px; color: var(--admin-accent-ink); background: var(--admin-accent-soft); }
.overview-metric-icon--flash { border-color: var(--admin-live-border); color: var(--admin-live-ink); background: var(--admin-live-bg); }
.overview-metric-icon--neutral { border-color: var(--admin-card-border); color: var(--admin-icon-ink); background: var(--admin-neutral-bg); }
.overview-summary strong {
  font-size: 40px;
  line-height: 1.2;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.overview-card-hint,
.overview-run-id {
  color: var(--admin-muted);
  font-size: 12px;
}
.overview-card-hint { width: 100%; padding-top: 12px; margin-top: auto; border-top: 1px solid var(--admin-line); }
.overview-runs-table { min-width: 700px; }
.overview-runs-table :where(tbody tr:hover) { --bs-table-bg: var(--admin-accent-hover-bg); }
.overview-runs-table.table > :not(caption) > * > * { padding-block: 16px; }
.overview-runs-scroll { margin-top: 20px; }
.overview-runs-table td { font-variant-numeric: tabular-nums; }
.overview-source,
.overview-run-id { display: block; }
.overview-run-id { margin-top: 4px; overflow-wrap: anywhere; }
.overview-status {
  display: inline-block;
  padding: 4px 9px;
  border: 1px solid var(--admin-neutral-status-border);
  border-radius: 20px;
  background: var(--admin-neutral-status-bg);
  color: var(--admin-neutral-status-ink);
  font-size: 11px;
  font-weight: 600;
}
.overview-status[data-tone="success"] { background: var(--admin-success-bg); border-color: var(--admin-success-border); color: var(--admin-success-ink); }
.overview-status[data-tone="danger"] { background: var(--admin-danger-bg); border-color: var(--admin-danger-border); color: var(--admin-danger-ink); }
.overview-runs-scroll:focus-visible { outline: 2px solid var(--admin-focus); outline-offset: 3px; }
.admin-readiness > p { color: var(--admin-muted); font-size: 12px; }
@media (max-width: 1199.98px) {
  .admin-overview-panels.overview-panels {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "work" "registrations" "next" "chart" "runs" "activity" "readiness";
  }
  .overview-next-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-summary-link, .overview-summary-static { padding: 20px; }
}
@media (max-width: 991.98px) {
  .overview-summary { gap: 12px; }
  .overview-metric-label { flex-wrap: wrap-reverse; }
  .overview-summary strong { font-size: 34px; }
}
@media (max-width: 767.98px) {
  .overview-next-steps { grid-template-columns: minmax(0, 1fr); }
  .overview-summary { grid-template-columns: minmax(0, 1fr); }
  .overview-metric-label { flex-wrap: nowrap; }
  .overview-panels > :where(.card), .overview-next-steps > :where(.card) { padding: 20px; }
}
@media (max-width: 575.98px) {
  .overview-chart-run { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .overview-toolbar .btn { width: 100%; justify-content: center; }
}
/* 320px phones: a little less card padding keeps the counts and labels on one line. */
@media (max-width: 359.98px) {
  .overview-panels > :where(.card), .overview-next-steps > :where(.card) { padding: 16px; }
  .overview-summary-link, .overview-summary-static { padding: 16px; }
  .overview-chart-bar-row { grid-template-columns: 64px minmax(0, 1fr) 40px; }
}
@media (prefers-reduced-motion: reduce) {
  .overview-summary > .card, .overview-shortcut-list a { transition: none; }
}
</style>
