<script setup lang="ts">
import type { IngestionDashboardResponse, IngestionRunResponse } from '@broke-oclock/contracts/ingestion'
import { BButton } from '@broke-oclock/ui'
import AdminShell from '@web/components/admin/AdminShell.vue'
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import AdminWorkspaceTabs from '@web/components/admin/AdminWorkspaceTabs.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { createAdminReadFence } from '@web/lib/admin-session'
import { adminRecordId, adminReturnTo } from '@web/lib/admin-workflow-links'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import AdminSignIn from '@web/modules/ingestion-admin/AdminSignIn.vue'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import FailedPosts from '@web/modules/ingestion-admin/FailedPosts.vue'
import ImportedDealQueue from '@web/modules/ingestion-admin/ImportedDealQueue.vue'
import IngestionRuns from '@web/modules/ingestion-admin/IngestionRuns.vue'
import LocationSearch from '@web/modules/ingestion-admin/LocationSearch.vue'
import SourcesPanel from '@web/modules/ingestion-admin/SourcesPanel.vue'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

const access = ref('loading')
const dashboard = ref<IngestionDashboardResponse | null>(null)
const revision = ref(0)
const runPending = ref(false)
const runError = ref('')
const runResult = ref<IngestionRunResponse | null>(null)
const fence = createAdminReadFence()
const operationFence = createAdminReadFence()
const nativeFence = createAdminReadFence()
const logoutStarting = (event: Event) => { if ((event.target as Element)?.closest('[data-testid="admin-sign-out"]')) nativeFence.invalidate() }
const sessionRefreshKey = ref(0)
const panelKey = ref(0)
const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const workspaceTabs = [
  { id: 'drafts', label: 'Imported deals' },
  { id: 'failed', label: 'Failed posts' },
  { id: 'runs', label: 'Run history' },
  { id: 'settings', label: 'Sources & import' },
] as const
type Workspace = typeof workspaceTabs[number]['id']
const workspaceForHash = (hash: string | undefined): Workspace => {
  if (hash === '#failed-posts') return 'failed'
  if (hash === '#runs-title') return 'runs'
  if (['#sources-title', '#source-title', '#locations-title'].includes(hash ?? '')) return 'settings'
  return 'drafts'
}
const workspace = ref<Workspace>(adminRecordId(route?.query.postId) ? 'failed' : workspaceForHash(route?.hash))
const panelBusy = ref({ drafts: false, failed: false, sources: false })
const workspaceBusy = computed(() => runPending.value || Object.values(panelBusy.value).some(Boolean))
const setPanelBusy = (panel: keyof typeof panelBusy.value, value: boolean) => {
  panelBusy.value = { ...panelBusy.value, [panel]: value }
}
const workspaceHashes: Record<Workspace, string> = {
  drafts: '#queue-title', failed: '#failed-posts', runs: '#runs-title', settings: '#sources-title',
}
const chooseWorkspace = (value: string) => {
  if (workspaceBusy.value || value === workspace.value || !workspaceTabs.some(tab => tab.id === value)) return
  workspace.value = value as Workspace
  if (router && route) void router.replace({ query: route.query, hash: workspaceHashes[workspace.value] })
}
let routeChangeQueued = false
const filter = (value: unknown): 'PENDING' | 'APPROVED' | 'REJECTED' => value === 'APPROVED' || value === 'REJECTED' ? value : 'PENDING'
const initialStatus = ref(filter(route?.query.status))
const initialDraftId = ref(adminRecordId(route?.query.draftId))
const initialPostId = ref(adminRecordId(route?.query.postId))
const cursorValue = (value: unknown) => typeof value === 'string' && value.length <= 2000 ? value : undefined
const initialCursor = ref(cursorValue(route?.query.draftCursor))
const returnTo = computed(() => adminReturnTo(route?.query.returnTo))
const applyRouteWorkspace = () => {
  const nextStatus = filter(route?.query.status)
  if (nextStatus !== initialStatus.value) initialStatus.value = nextStatus
  initialDraftId.value = adminRecordId(route?.query.draftId)
  initialPostId.value = adminRecordId(route?.query.postId)
  initialCursor.value = cursorValue(route?.query.draftCursor)
  workspace.value = initialPostId.value && !route?.hash ? 'failed' : workspaceForHash(route?.hash)
  routeChangeQueued = false
}
watch(() => [route?.hash, route?.query.status, route?.query.draftId, route?.query.draftCursor, route?.query.postId], () => {
  if (workspaceBusy.value) routeChangeQueued = true
  else applyRouteWorkspace()
}, { flush: 'sync' })
watch(workspaceBusy, pending => { if (!pending && routeChangeQueued) applyRouteWorkspace() }, { flush: 'sync' })
const close = () => {
  fence.invalidate()
  operationFence.invalidate()
  access.value = 'closed'
  dashboard.value = null
  runResult.value = null
  runError.value = ''
  runPending.value = false
  panelBusy.value = { drafts: false, failed: false, sources: false }
  revision.value++
  panelKey.value++
}
const anonymous = () => { close(); access.value = 'unauthorized' }
const denied = (code: string) => {
  nativeFence.invalidate()
  close()
  dashboard.value = null
  access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : 'forbidden'
}
const load = async () => {
  const ticket = fence.begin()
  if (!dashboard.value) access.value = 'loading'
  try {
    const result = await api.ingestion.dashboard()
    if (!fence.current(ticket)) return false
    dashboard.value = result
    access.value = 'allowed'
    return true
  } catch (error) {
    if (!fence.current(ticket)) return false
    const code = errorCode(error)
    close()
    access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : code === 'FORBIDDEN' ? 'forbidden' : 'error'
    return false
  }
}
const refresh = async () => {
  if (await load()) revision.value += 1
}
const run = async () => {
  if (access.value !== 'allowed' || runPending.value || !dashboard.value?.source.enabled || !dashboard.value.source.reuseApproved) return
  const ticket = operationFence.begin()
  runPending.value = true
  runError.value = ''
  runResult.value = null
  try {
    const result = await api.ingestion.run()
    if (!operationFence.current(ticket)) return
    runResult.value = result
    await refresh()
  } catch (failure) {
    if (!operationFence.current(ticket)) return
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') { denied(code); return }
    runError.value = 'Unable to run ingestion. Please try again.'
  } finally {
    if (operationFence.current(ticket)) runPending.value = false
  }
}
const reload = async () => {
  close()
  const ticket = fence.begin()
  const probe = nativeFence.begin()
  access.value = 'loading'
  try {
    const identity = await authClient.getSession({ query: { disableCookieCache: true } })
    if (!nativeFence.current(probe)) return
    if (identity.error) { close(); return }
    if (!identity.data?.user) { confirmAdminIdentity(null); if (access.value === 'closed' || access.value === 'loading') anonymous(); return }
    if (!fence.current(ticket)) return
    await load()
  } catch { if (nativeFence.current(probe) && fence.current(ticket)) close() }
}
const signedIn = () => { sessionRefreshKey.value++; void reload() }
onMounted(reload)
onUnmounted(() => { fence.dispose(); operationFence.dispose(); nativeFence.dispose() })
</script>

<template>
  <AdminShell @click.capture="logoutStarting" title="Ingestion admin" :refresh-key="sessionRefreshKey" @closing="close" @signed-out="anonymous" @access-reload="reload">
  <section aria-label="Ingestion administration">
    <TicketLoading v-if="access === 'loading'" label="Loading ingestion…" />
    <AdminSignIn v-else-if="access === 'unauthorized'" @signed-in="signedIn" />
    <p v-else-if="access === 'closed'" role="status">Access is closed. Use the session controls to retry or recheck.</p>
    <p v-else-if="access === 'forbidden'" role="alert">You do not have permission to review ingestion.</p>
    <div v-else-if="access === 'error'" role="alert">
      <p>Unable to load ingestion. Please try again.</p>
      <BButton data-testid="retry-dashboard" @click="reload">Retry dashboard</BButton>
    </div>
    <template v-else-if="dashboard">
      <AdminTaskLink v-if="returnTo" :to="returnTo" :disabled="workspaceBusy" class="d-inline-block mb-3">← Back to deal evidence</AdminTaskLink>
      <header class="ingestion-introduction">
        <div><p class="admin-eyebrow">Import workspace</p><p>Import from configured sources, investigate failed posts and send imported deals to the full editor.</p></div>
        <AdminStatusBadge :status="dashboard.source.enabled ? 'ACTIVE' : 'PAUSED'" :label="dashboard.source.enabled ? 'Imports enabled' : 'Imports paused'" />
      </header>
      <dl aria-label="Ingestion counts" class="ingestion-counts">
        <div v-for="(count, status) in dashboard.counts" :key="status"><dd>{{ count }}</dd><dt class="text-capitalize">{{ status }}</dt></div>
      </dl>
      <AdminWorkspaceTabs :model-value="workspace" :tabs="workspaceTabs" id-prefix="ingestion-workspace" label="Ingestion workspace" :disabled="workspaceBusy" @update:model-value="chooseWorkspace" />
      <p v-if="workspaceBusy" class="ingestion-pending" role="status">Finish the current operation before switching workspaces.</p>
      <!-- Keep protected controllers mounted: switching tasks must retain captured versions and unknown-result locks. -->
      <div id="ingestion-workspace-panel-drafts" role="tabpanel" aria-labelledby="ingestion-workspace-tab-drafts" :hidden="workspace !== 'drafts'" :inert="workspace !== 'drafts' ? true : undefined">
        <ImportedDealQueue :key="panelKey" :initial-status="initialStatus" :initial-cursor="initialCursor" :initial-draft-id="initialDraftId" :revision="revision" @denied="denied" />
      </div>
      <div id="ingestion-workspace-panel-failed" role="tabpanel" aria-labelledby="ingestion-workspace-tab-failed" :hidden="workspace !== 'failed'" :inert="workspace !== 'failed' ? true : undefined">
        <FailedPosts :key="`posts-${panelKey}`" :initial-post-id="initialPostId" @denied="denied" @busy="setPanelBusy('failed', $event)" />
      </div>
      <div id="ingestion-workspace-panel-runs" role="tabpanel" aria-labelledby="ingestion-workspace-tab-runs" :hidden="workspace !== 'runs'" :inert="workspace !== 'runs' ? true : undefined">
        <IngestionRuns :revision="revision" @denied="denied" />
      </div>
      <div id="ingestion-workspace-panel-settings" role="tabpanel" aria-labelledby="ingestion-workspace-tab-settings" :hidden="workspace !== 'settings'" :inert="workspace !== 'settings' ? true : undefined">
        <section class="card p-4 mb-4 ingestion-source" aria-labelledby="source-title">
          <div class="ingestion-source-heading"><div><h2 id="source-title">Source readiness</h2><p class="mb-0">{{ dashboard.source.name }}</p></div><BButton data-testid="run-ingestion" variant="primary" :disabled="workspaceBusy || !dashboard.source.enabled || !dashboard.source.reuseApproved" @click="run">{{ runPending ? 'Running ingestion…' : 'Run ingestion' }}</BButton></div>
          <ul class="ingestion-readiness">
            <li>{{ dashboard.source.enabled ? 'Ingestion is enabled' : 'Ingestion is disabled' }}</li>
            <li>{{ dashboard.source.reuseApproved ? 'Operator reuse attestation is recorded, not publisher permission' : 'Operator reuse attestation is not recorded' }}</li>
            <li>{{ dashboard.source.onemapConfigured ? 'OneMap is configured' : 'OneMap is not configured' }}</li>
          </ul>
          <p v-if="runError" role="alert" class="text-danger mt-3 mb-0">{{ runError }}</p>
          <p v-if="runResult" role="status" class="mt-3 mb-0">Run {{ runResult.runId }}: {{ runResult.status }}. Fetched {{ runResult.fetchedCount }}, created {{ runResult.createdCount }}, updated {{ runResult.updatedCount }}, failed {{ runResult.failedCount }}.</p>
        </section>
        <SourcesPanel @changed="refresh" @denied="denied" @busy="setPanelBusy('sources', $event)" />
        <details class="ingestion-tools" :open="route?.hash === '#locations-title'"><summary>Location lookup</summary><p class="text-secondary">Supporting tools for investigation. Location candidates do not verify or attach outlets.</p><LocationSearch :configured="dashboard.source.onemapConfigured" @denied="denied" /></details>
      </div>
    </template>
  </section>
  </AdminShell>
</template>

<style scoped>
.ingestion-introduction { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.ingestion-introduction p { margin: 0; }
.ingestion-introduction .admin-eyebrow { color: var(--admin-muted); font-size: .75rem; margin-bottom: 6px; }
.ingestion-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0 0 24px; }
.ingestion-counts > div { padding: 16px 20px; border: 1px solid var(--admin-border); border-radius: 14px; background: var(--admin-surface); }
.ingestion-counts dd { font-size: 1.75rem; font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1.2; margin: 0 0 6px; }
.ingestion-counts dt { color: var(--admin-muted); font-size: .8125rem; font-weight: 500; }
.ingestion-pending { color: var(--admin-muted); margin-block: 12px; }
.ingestion-source-heading { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 16px; }
.ingestion-readiness { display: flex; flex-wrap: wrap; gap: 10px 24px; padding-left: 18px; margin: 20px 0 0; color: var(--admin-muted); }
.ingestion-tools { border: 1px solid var(--admin-border); border-radius: 16px; background: var(--admin-surface); padding: 20px; }
.ingestion-tools > summary { cursor: pointer; font-weight: 650; padding-block: 4px; }
.ingestion-tools > p { margin-top: 16px; }
@media (max-width: 767px) {
 .ingestion-introduction { align-items: start; flex-direction: column; }
 .ingestion-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 .ingestion-counts > div { padding: 14px 16px; }
 .ingestion-source-heading .btn { width: 100%; }
}
</style>
