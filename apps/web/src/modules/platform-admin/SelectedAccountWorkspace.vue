<script setup lang="ts">
import AccountAccessPanel from '@web/modules/platform-admin/AccountAccessPanel.vue'
import type { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'
import WorkspaceTabs from '@web/modules/platform-admin/WorkspaceTabs.vue'
import AccountSecurityPanel from '@web/modules/platform-security/AccountSecurityPanel.vue'
import { ref, watch } from 'vue'

const props = defineProps<{ s: ReturnType<typeof usePlatformAdmin>; active: boolean }>()
const emit = defineEmits<{ activity: []; close: [] }>()
const heading = ref<HTMLElement | null>(null)
defineExpose({ focusHeading: () => heading.value?.focus() })
const detailTab = ref('access')
const consentRevision = ref(0)
const detailTabs = [{ id: 'access', label: 'Access' }, { id: 'security', label: 'Security' }]
watch([detailTab, () => props.active], (_value, previous) => {
  props.s.note = ''
  props.s.confirmed = false
  // Revision resets security consent through its existing public input without
  // disposing the controller (and its per-identity unknown-result locks).
  if (previous[0] === 'security' && previous[1]) consentRevision.value++
}, { flush: 'sync' })
</script>
<template>
  <div class="selected-account">
    <p v-if="s.detail.loading" role="status">Loading account details…</p>
    <p v-if="s.detail.error" role="alert">{{ s.detail.error }}</p>
    <button type="button" v-if="s.selectedId && !s.detail.data" data-testid="reload-account" class="btn btn-outline-secondary" :disabled="s.busy || s.detail.loading" @click="s.selectAccount(s.selectedId)">Reload account</button>
    <section v-if="s.detail.data" aria-label="Account details" class="workspace-surface selected-account-surface">
      <header class="selected-account-heading">
        <div><h2 ref="heading" data-testid="selected-account-heading" tabindex="-1" class="h5">{{ s.detail.data.name }}</h2><p class="record-email">{{ s.detail.data.email }}</p></div>
        <div class="selected-account-actions"><span class="record-role">{{ s.detail.data.role }}</span><button type="button" data-testid="close-account-details" class="btn close-details" aria-label="Close account details" :disabled="s.busy" @click="emit('close')">×</button></div>
      </header>
      <dl class="account-metadata"><div><dt>Account ID:</dt><dd>{{ s.detail.data.id }}</dd></div><div><dt>Version</dt><dd>{{ s.detail.data.version }}</dd></div><div><dt>Created</dt><dd>{{ s.detail.data.createdAt }}</dd></div></dl>
      <div class="detail-tools">
        <button type="button" data-testid="reload-account" class="btn btn-outline-secondary" :disabled="s.busy || s.detail.loading" @click="s.selectAccount(s.selectedId)">Reload account</button>
        <button type="button" data-testid="account-audit" class="btn btn-outline-secondary" :disabled="s.busy" @click="emit('activity')">View this account's audit</button>
      </div>
      <p v-if="s.accountError" role="alert">{{ s.accountError }}</p>
      <WorkspaceTabs v-model="detailTab" :tabs="detailTabs" id-prefix="account-detail" label="Account detail views" :disabled="s.busy" />
      <div id="account-detail-panel-access" role="tabpanel" aria-labelledby="account-detail-tab-access" :hidden="detailTab !== 'access'" :inert="detailTab !== 'access' ? true : undefined" v-show="detailTab === 'access'">
        <AccountAccessPanel :s="s" />
      </div>
      <div id="account-detail-panel-security" role="tabpanel" aria-labelledby="account-detail-tab-security" :hidden="detailTab !== 'security'" :inert="detailTab !== 'security' ? true : undefined" v-show="detailTab === 'security'">
        <AccountSecurityPanel :user-id="s.detail.data.id" :account-version="s.detail.data.version" :revision="s.securityRevision + consentRevision" :disabled="s.accountActionBusy || s.detail.loading || s.staleAccounts.has(s.detail.data.id)" @busy="s.setSecurityBusy" @changed="s.securityChanged" @denied="s.securityDenied" @freshness-required="s.requireFreshLogin" />
      </div>
    </section>
    <p v-if="!s.selectedId" class="empty-selection">Select an account to review its role and stall access.</p>
  </div>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>

<style scoped>
.selected-account-surface :deep(.security-panel) {
  border: 0;
  border-radius: 0;
  /* biome-ignore lint/complexity/noImportantStyles: Override the existing Bootstrap p-3 utility without changing stateful security controls. */
  padding: 0 !important;
}
</style>
