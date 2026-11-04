<script setup lang="ts">
import AdminShell from '@web/components/admin/AdminShell.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { createAdminReadFence } from '@web/lib/admin-session'
import { authClient } from '@web/lib/auth-client'
import CataloguePanel from '@web/modules/admin-catalogue/CataloguePanel.vue'
import { onMounted, onUnmounted, ref } from 'vue'

const access = ref<'loading' | 'allowed' | 'closed' | 'error' | 'UNAUTHORIZED' | 'FORBIDDEN'>(
  'loading',
)
const refreshKey = ref(0)
const fence = createAdminReadFence()
const close = () => {
  fence.invalidate()
  access.value = 'closed'
}
const anonymous = () => {
  close()
  access.value = 'UNAUTHORIZED'
}
const denied = (code: 'UNAUTHORIZED' | 'FORBIDDEN') => {
  close()
  access.value = code
}
const reload = async () => {
  close()
  const ticket = fence.begin()
  access.value = 'loading'
  try {
    const identity = await authClient.getSession({ query: { disableCookieCache: true } })
    if (!fence.current(ticket)) return
    if (identity.error) {
      access.value = 'error'
      return
    }
    if (!identity.data?.user) {
      confirmAdminIdentity(null)
      anonymous()
      return
    }
    confirmAdminIdentity(identity.data)
    if (!fence.current(ticket)) return
    access.value = 'allowed'
  } catch {
    if (fence.current(ticket)) access.value = 'error'
  }
}
const signedIn = () => {
  refreshKey.value++
  void reload()
}
onMounted(reload)
onUnmounted(fence.dispose)
</script>
<template>
  <AdminShell :access="access" title="Merchants & outlets" :refresh-key="refreshKey" @closing="close" @signed-out="anonymous" @access-reload="reload">
    <p v-if="access === 'loading'" role="status">Checking access…</p>
    <SharedSignIn heading-level="h1" v-else-if="access === 'UNAUTHORIZED'" title="Sign in to manage merchants and outlets" destination="/admin/catalogue" @signed-in="signedIn" />
    <div v-else-if="access === 'FORBIDDEN'" role="alert"><p>You do not have permission to manage merchants and outlets.</p><button class="btn btn-outline-primary" type="button" @click="reload">Recheck access</button></div>
    <p v-else-if="access === 'closed'" role="status">Access is closed. Use the session controls to recheck.</p>
    <div v-else-if="access === 'error'" role="alert"><p>Couldn’t confirm your session. Changes stay locked until it’s confirmed.</p><button class="btn btn-outline-primary" type="button" @click="reload">Retry access</button></div>
    <CataloguePanel v-else :key="refreshKey" @denied="denied" />
  </AdminShell>
</template>
