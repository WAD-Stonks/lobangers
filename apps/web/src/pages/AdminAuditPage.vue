<script setup lang="ts">
import AdminShell from '@web/components/admin/AdminShell.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { createAdminReadFence } from '@web/lib/admin-session'
import { adminReturnTo } from '@web/lib/admin-workflow-links'
import { authClient } from '@web/lib/auth-client'
import AuditPanel from '@web/modules/platform-admin/AuditPanel.vue'
import type { AuditDenial, AuditInitialFilters } from '@web/modules/platform-admin/use-audit'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { routeLocationKey } from 'vue-router'

const route = inject(routeLocationKey, null)
const initialFilters = computed<AuditInitialFilters>(() => Object.fromEntries(
  ['userId', 'actorId', 'action', 'subjectType', 'subjectId', 'from', 'until']
    .filter(key => route?.query[key] !== undefined)
    .map(key => [key, route?.query[key]]),
))
const returnTo = computed(() => adminReturnTo(route?.query.returnTo))
const returnLabel = computed(() => returnTo.value?.startsWith('/admin/accounts?accountId=') ? 'Back to account' : 'Back to previous task')
const access = ref<'loading' | 'allowed' | 'closed' | 'error' | AuditDenial>('loading')
const refreshKey = ref(0)
const fence = createAdminReadFence()
const close = () => { fence.invalidate(); access.value = 'closed' }
const anonymous = () => { close(); access.value = 'UNAUTHORIZED' }
const denied = (code: AuditDenial) => { close(); access.value = code }
const reload = async () => {
  close()
  const ticket = fence.begin()
  access.value = 'loading'
  try {
    const identity = await authClient.getSession({ query: { disableCookieCache: true } })
    if (!fence.current(ticket)) return
    if (identity.error) { access.value = 'error'; return }
    if (!identity.data?.user) { confirmAdminIdentity(null); anonymous(); return }
    // Native identity only permits mounting the reader. The audit GET performs
    // the authoritative current ADMIN check; browser role never grants access.
    confirmAdminIdentity(identity.data)
    if (!fence.current(ticket)) return
    access.value = 'allowed'
  } catch {
    if (fence.current(ticket)) access.value = 'error'
  }
}
const signedIn = () => { refreshKey.value++; void reload() }
onMounted(reload)
onUnmounted(fence.dispose)
</script>

<template>
  <AdminShell :access="access" title="Audit investigation" :refresh-key="refreshKey" @closing="close" @signed-out="anonymous" @access-reload="reload">
    <p v-if="access === 'loading'" role="status">Checking audit access…</p>
    <SharedSignIn heading-level="h1" v-else-if="access === 'UNAUTHORIZED'" title="Sign in to view audit history" destination="/admin/audit" @signed-in="signedIn" />
    <div v-else-if="access === 'FORBIDDEN'" role="alert">
      <p>You do not have permission to view audit history.</p>
      <button type="button" class="btn btn-outline-primary" @click="reload">Recheck audit access</button>
    </div>
    <p v-else-if="access === 'closed'" role="status">Audit access is closed. Use the session controls to retry or recheck.</p>
    <div v-else-if="access === 'error'" role="alert">
      <p>Unable to confirm your session. Audit history remains closed.</p>
      <button type="button" class="btn btn-outline-primary" @click="reload">Retry audit access</button>
    </div>
    <template v-else>
      <p v-if="returnTo" class="mb-3"><AdminTaskLink :to="returnTo">{{ returnLabel }}</AdminTaskLink></p>
      <AuditPanel :access-key="refreshKey" :initial-filters="initialFilters" @denied="denied" />
    </template>
  </AdminShell>
</template>
