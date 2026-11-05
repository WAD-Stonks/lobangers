<script setup lang="ts">
import { type FlashDropView, flashDropViewSchema } from '@broke-oclock/contracts/flash-drops'
import AdminShell from '@web/components/admin/AdminShell.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { createAdminReadFence } from '@web/lib/admin-session'
import { authClient } from '@web/lib/auth-client'
import FlashDropsPanel from '@web/modules/admin-flash-drops/FlashDropsPanel.vue'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

const access = ref<'loading' | 'allowed' | 'closed' | 'error' | 'UNAUTHORIZED' | 'FORBIDDEN'>(
  'loading',
)
const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const initialView = computed(() => {
  const parsed = flashDropViewSchema.safeParse(route?.query.view)
  return parsed.success ? parsed.data : 'live'
})
const syncView = (view: FlashDropView) => {
  if (!router || !route || initialView.value === view) return
  const { view: _old, ...rest } = route.query
  void router.replace({ query: view === 'live' ? rest : { ...rest, view } })
}
const refreshKey = ref(0),
  fence = createAdminReadFence()
const close = () => {
  fence.invalidate()
  access.value = 'closed'
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
    const session = await authClient.getSession({ query: { disableCookieCache: true } })
    if (!fence.current(ticket)) return
    if (!session.error && session.data?.user) {
      confirmAdminIdentity(session.data)
      if (!fence.current(ticket)) return
    }
    if (!session.error && !session.data?.user) confirmAdminIdentity(null)
    access.value = session.error ? 'error' : session.data?.user ? 'allowed' : 'UNAUTHORIZED'
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
 <AdminShell :access="access" title="Flash deals" :refresh-key="refreshKey" @closing="close" @signed-out="denied('UNAUTHORIZED')" @access-reload="reload">
  <p v-if="access === 'loading'" role="status">Checking session…</p>
  <SharedSignIn heading-level="h1" v-else-if="access === 'UNAUTHORIZED'" title="Sign in to manage flash deals" destination="/admin/flash-drops" @signed-in="signedIn" />
  <div v-else-if="access === 'FORBIDDEN'" role="alert"><p>Current administrator access is required.</p><button type="button" class="btn btn-outline-primary" @click="reload">Recheck access</button></div>
  <div v-else-if="access === 'error'" role="alert"><p>Unable to confirm session. Flash deals stay closed.</p><button type="button" class="btn btn-outline-primary" @click="reload">Retry session check</button></div>
  <p v-else-if="access === 'closed'" role="status">Flash deals are closed. Use session controls to recheck access.</p>
  <FlashDropsPanel v-else :key="refreshKey" :initial-view="initialView" @denied="denied" @view-change="syncView" />
 </AdminShell>
</template>
