<script setup lang="ts">
import AdminShell from '@web/components/admin/AdminShell.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { adminAuditHref, adminRecordId, adminReturnTo } from '@web/lib/admin-workflow-links'
import AccountsDirectory from '@web/modules/platform-admin/AccountsDirectory.vue'
import MerchantRequestsWorkspace from '@web/modules/platform-admin/MerchantRequestsWorkspace.vue'
import SelectedAccountWorkspace from '@web/modules/platform-admin/SelectedAccountWorkspace.vue'
import { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'
import WorkspaceTabs from '@web/modules/platform-admin/WorkspaceTabs.vue'
import FreshLoginNotice from '@web/modules/platform-security/FreshLoginNotice.vue'
import { computed, inject, nextTick, ref, watch } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const status = (value: unknown): 'PENDING' | 'APPROVED' | 'REJECTED' => value === 'APPROVED' || value === 'REJECTED' ? value : 'PENDING'
const s = usePlatformAdmin(status(route?.query.requestStatus))

const workspace = ref(route?.hash === '#merchant-requests' || route?.query.requestStatus !== undefined ? 'requests' : 'accounts')
const detailOpen = ref(true)
const routeNotice = ref('')
const returnTo = computed(() => adminReturnTo(route?.query.returnTo))
const returnLabel = computed(() => returnTo.value?.includes('#merchant-requests') ? 'Back to merchant requests' : 'Back to previous task')
const accountHref = (id: string) => {
  const query = new URLSearchParams({ accountId: id })
  if (returnTo.value) query.set('returnTo', returnTo.value)
  return `/admin/accounts?${query}`
}
const auditHref = computed(() => {
  const id = adminRecordId(s.detail.data?.id)
  return id ? adminAuditHref({ userId: id, returnTo: accountHref(id) }) : undefined
})
const selectedView = ref<InstanceType<typeof SelectedAccountWorkspace> | null>(null)
const workspaceRoot = ref<HTMLElement | null>(null)
watch([workspace, detailOpen], () => {
  s.note = ''
  s.confirmed = false
  s.requestNote = ''
  s.requestConfirmed = false
}, { flush: 'sync' })
let routeQueued = false
const syncRoute = (accountId?: string) => {
  if (!router || !route) return
  const query = { ...route.query }
  delete query.accountId
  delete query.requestStatus
  if (accountId) query.accountId = accountId
  if (workspace.value === 'requests') query.requestStatus = s.requestStatus
  void router.replace({ query, hash: workspace.value === 'requests' ? '#merchant-requests' : '' })
}
const applyRoute = async () => {
  if (s.busy) { routeQueued = true; return }
  routeQueued = false
  if (s.access !== 'allowed') return
  const rawId = route?.query.accountId
  const id = adminRecordId(rawId)
  routeNotice.value = rawId !== undefined && !id ? 'This account link is invalid. Choose an account from the directory.' : ''
  if (id) {
    workspace.value = 'accounts'
    if (s.selectedId !== id || (!s.detail.data && !s.detail.loading)) await selectAccount(id, false)
    else detailOpen.value = true
  } else if (route?.hash === '#merchant-requests' || route?.query.requestStatus !== undefined) {
    workspace.value = 'requests'
    s.requestStatus = status(route?.query.requestStatus)
  } else {
    workspace.value = 'accounts'
    if (rawId !== undefined) detailOpen.value = false
  }
}
watch(() => [route?.query.accountId, route?.query.requestStatus, route?.hash, s.access], () => { void applyRoute() }, { immediate: true, flush: 'sync' })
watch(() => s.busy, busy => { if (!busy && routeQueued) void applyRoute() }, { flush: 'sync' })
watch(() => s.requestStatus, () => { if (workspace.value === 'requests' && !s.busy) syncRoute() })
const chooseWorkspace = (value: string) => {
  if (s.busy || !['accounts', 'requests'].includes(value)) return
  workspace.value = value
  syncRoute(value === 'accounts' && detailOpen.value ? adminRecordId(s.selectedId) : undefined)
}
async function selectAccount(id: string, updateRoute = true) {
  if (s.busy) return
  const reopening = !detailOpen.value && s.selectedId === id && !!s.detail.data
  detailOpen.value = true
  routeNotice.value = ''
  if (updateRoute && adminRecordId(id)) syncRoute(id)
  if (!reopening) await s.selectAccount(id)
  await nextTick()
  if (s.selectedId === id && workspace.value === 'accounts') selectedView.value?.focusHeading()
}
async function closeDetails() {
  if (s.busy) return
  detailOpen.value = false
  syncRoute()
  await nextTick()
  const row = Array.from(workspaceRoot.value?.querySelectorAll<HTMLButtonElement>('[data-testid]') ?? [])
    .find(button => button.dataset.testid === `account-${s.selectedId}`)
  ;(row ?? workspaceRoot.value?.querySelector<HTMLInputElement>('#account-search'))?.focus()
}
const workspaceTabs = [{ id: 'accounts', label: 'Directory' }, { id: 'requests', label: 'Merchant requests' }]
</script>
<template>
  <AdminShell @click.capture="s.logoutStarting" title="Accounts" :refresh-key="s.sessionRefreshKey" @closing="s.close" @signed-out="s.anonymous" @access-reload="s.load">
  <section ref="workspaceRoot" aria-label="Platform administration" class="platform-admin">
    <TicketLoading v-if="s.access === 'loading'" label="Loading accounts…" />
    <SharedSignIn v-else-if="s.access === 'UNAUTHORIZED'" title="Sign in to manage accounts" destination="/admin/accounts" @signed-in="s.signedIn" />
    <p v-else-if="s.access === 'closed'" role="status">Access is closed. Use the session controls to retry or recheck.</p>
    <p v-else-if="s.access === 'FORBIDDEN'" role="alert">You do not have permission to manage platform accounts.</p>
    <div v-else-if="s.access === 'error'" role="alert">
      <p>Unable to load platform administration.</p><button type="button" class="btn btn-outline-primary" data-testid="retry-platform-admin" @click="s.load">Retry platform admin</button>
    </div>
    <template v-else-if="s.access === 'allowed'">
      <p v-if="s.notice" role="status">{{ s.notice }}</p>
      <FreshLoginNotice v-if="s.freshnessRequired" />

      <p v-if="returnTo" class="mb-3"><AdminTaskLink :to="returnTo" :disabled="s.busy">{{ returnLabel }}</AdminTaskLink></p>
      <p v-if="routeNotice" role="alert">{{ routeNotice }}</p>
      <WorkspaceTabs :model-value="workspace" @update:model-value="chooseWorkspace" :tabs="workspaceTabs" id-prefix="accounts-workspace" label="Accounts workspace" :disabled="s.busy" />
      <div id="accounts-workspace-panel-accounts" role="tabpanel" aria-labelledby="accounts-workspace-tab-accounts" :hidden="workspace !== 'accounts'" :inert="workspace !== 'accounts' ? true : undefined" v-show="workspace === 'accounts'">
        <div class="directory-layout" :class="{ 'has-selection': s.selectedId && detailOpen }">
          <AccountsDirectory :s="s" @select="selectAccount" />
          <SelectedAccountWorkspace ref="selectedView" :s="s" :active="workspace === 'accounts' && detailOpen" :hidden="!detailOpen" :inert="!detailOpen ? true : undefined" v-show="detailOpen" :audit-href="auditHref" @close="closeDetails" />
        </div>
      </div>
      <div id="accounts-workspace-panel-requests" role="tabpanel" aria-labelledby="accounts-workspace-tab-requests" :hidden="workspace !== 'requests'" :inert="workspace !== 'requests' ? true : undefined" v-show="workspace === 'requests'">
        <MerchantRequestsWorkspace :s="s" />
      </div>
      <p class="workspace-policy">Account deletion is unavailable pending the retention and anonymisation policy.</p>
    </template>
  </section>
  </AdminShell>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>
