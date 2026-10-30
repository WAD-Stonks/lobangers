<script setup lang="ts">
import AdminShell from '@web/components/admin/AdminShell.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import AccountActivityWorkspace from '@web/modules/platform-admin/AccountActivityWorkspace.vue'
import AccountsDirectory from '@web/modules/platform-admin/AccountsDirectory.vue'
import MerchantRequestsWorkspace from '@web/modules/platform-admin/MerchantRequestsWorkspace.vue'
import SelectedAccountWorkspace from '@web/modules/platform-admin/SelectedAccountWorkspace.vue'
import { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'
import WorkspaceTabs from '@web/modules/platform-admin/WorkspaceTabs.vue'
import FreshLoginNotice from '@web/modules/platform-security/FreshLoginNotice.vue'
import { inject, nextTick, ref, watch } from 'vue'
import { routeLocationKey } from 'vue-router'

const route = inject(routeLocationKey, null)
const status = (value: unknown): 'PENDING' | 'APPROVED' | 'REJECTED' => value === 'APPROVED' || value === 'REJECTED' ? value : 'PENDING'
const s = usePlatformAdmin(status(route?.query.requestStatus))
watch(() => route?.query.requestStatus, value => { s.requestStatus = status(value) }, { flush: 'sync' })

const workspace = ref(route?.hash === '#merchant-requests' || route?.query.requestStatus !== undefined ? 'requests' : 'accounts')
const detailOpen = ref(true)
const selectedView = ref<InstanceType<typeof SelectedAccountWorkspace> | null>(null)
const workspaceRoot = ref<HTMLElement | null>(null)
watch([workspace, detailOpen], () => {
  s.note = ''
  s.confirmed = false
  s.requestNote = ''
  s.requestConfirmed = false
}, { flush: 'sync' })
watch(() => [route?.query.requestStatus, route?.hash], () => {
  if (route?.hash === '#merchant-requests' || route?.query.requestStatus !== undefined) workspace.value = 'requests'
})
async function selectAccount(id: string) {
  if (s.busy) return
  const reopening = !detailOpen.value && s.selectedId === id && !!s.detail.data
  detailOpen.value = true
  if (!reopening) await s.selectAccount(id)
  await nextTick()
  if (s.selectedId === id && workspace.value === 'accounts') selectedView.value?.focusHeading()
}
async function closeDetails() {
  if (s.busy) return
  detailOpen.value = false
  await nextTick()
  const row = Array.from(workspaceRoot.value?.querySelectorAll<HTMLButtonElement>('[data-testid]') ?? [])
    .find(button => button.dataset.testid === `account-${s.selectedId}`)
  ;(row ?? workspaceRoot.value?.querySelector<HTMLInputElement>('#account-search'))?.focus()
}
async function viewActivity() {
  if (s.busy || !s.detail.data) return
  void s.viewAccountAudit()
  workspace.value = 'activity'
  await nextTick()
  workspaceRoot.value?.querySelector<HTMLButtonElement>('#accounts-workspace-tab-activity')?.focus()
}
const workspaceTabs = [{ id: 'accounts', label: 'Directory' }, { id: 'requests', label: 'Merchant requests' }, { id: 'activity', label: 'Account activity' }]
</script>
<template>
  <AdminShell @click.capture="s.logoutStarting" title="Accounts" :refresh-key="s.sessionRefreshKey" @closing="s.close" @signed-out="s.anonymous" @access-reload="s.load">
  <section ref="workspaceRoot" aria-label="Platform administration" class="platform-admin">
    <p v-if="s.access === 'loading'" role="status">Loading accounts…</p>
    <SharedSignIn v-else-if="s.access === 'UNAUTHORIZED'" title="Sign in to manage accounts" destination="/admin/accounts" @signed-in="s.signedIn" />
    <p v-else-if="s.access === 'closed'" role="status">Access is closed. Use the session controls to retry or recheck.</p>
    <p v-else-if="s.access === 'FORBIDDEN'" role="alert">You do not have permission to manage platform accounts.</p>
    <div v-else-if="s.access === 'error'" role="alert">
      <p>Unable to load platform administration.</p><button type="button" class="btn btn-outline-primary" data-testid="retry-platform-admin" @click="s.load">Retry platform admin</button>
    </div>
    <template v-else-if="s.access === 'allowed'">
      <p v-if="s.notice" role="status">{{ s.notice }}</p>
      <FreshLoginNotice v-if="s.freshnessRequired" />

      <WorkspaceTabs v-model="workspace" :tabs="workspaceTabs" id-prefix="accounts-workspace" label="Accounts workspace" :disabled="s.busy" />
      <div id="accounts-workspace-panel-accounts" role="tabpanel" aria-labelledby="accounts-workspace-tab-accounts" :hidden="workspace !== 'accounts'" :inert="workspace !== 'accounts' ? true : undefined" v-show="workspace === 'accounts'">
        <div class="directory-layout" :class="{ 'has-selection': s.selectedId && detailOpen }">
          <AccountsDirectory :s="s" @select="selectAccount" />
          <SelectedAccountWorkspace ref="selectedView" :s="s" :active="workspace === 'accounts' && detailOpen" :hidden="!detailOpen" :inert="!detailOpen ? true : undefined" v-show="detailOpen" @activity="viewActivity" @close="closeDetails" />
        </div>
      </div>
      <div id="accounts-workspace-panel-requests" role="tabpanel" aria-labelledby="accounts-workspace-tab-requests" :hidden="workspace !== 'requests'" :inert="workspace !== 'requests' ? true : undefined" v-show="workspace === 'requests'">
        <MerchantRequestsWorkspace :s="s" />
      </div>
      <div id="accounts-workspace-panel-activity" role="tabpanel" aria-labelledby="accounts-workspace-tab-activity" :hidden="workspace !== 'activity'" :inert="workspace !== 'activity' ? true : undefined" v-show="workspace === 'activity'">
        <AccountActivityWorkspace :s="s" />
      </div>
      <p class="workspace-policy">Account deletion is unavailable pending the retention and anonymisation policy.</p>
    </template>
  </section>
  </AdminShell>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>
