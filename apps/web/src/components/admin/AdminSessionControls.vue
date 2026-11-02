<script setup lang="ts">
import AdminSessionDisclosure from '@web/components/admin/AdminSessionDisclosure.vue'
import { createAdminSession } from '@web/lib/admin-session'
import { authClient } from '@web/lib/auth-client'
import { onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(defineProps<{ refreshKey?: number }>(), { refreshKey: 0 })
const emit = defineEmits<{ closing: []; signedOut: []; accessReload: [] }>()
// Public Vue hook must run in setup so native lifecycle subscriptions are owned.
const nativeState = authClient.useSession()
let disposed = false
let nativeGeneration = 0
let initialNativeReady: Promise<void> | undefined
let releaseInitialNative: (() => void) | undefined
let stopInitialNativeWatch: (() => void) | undefined
const finishInitialNative = () => {
  stopInitialNativeWatch?.()
  stopInitialNativeWatch = undefined
  initialNativeReady = undefined
  releaseInitialNative?.()
  releaseInitialNative = undefined
}
const nativeBusy = () => nativeState.value.isPending || nativeState.value.isRefetching
if (nativeBusy()) {
  // Refetch cancels the SDK's current GET -> POST chain. Let its first flight
  // settle, but never use that cached result instead of our explicit fresh check.
  initialNativeReady = new Promise<void>((resolve) => { releaseInitialNative = resolve })
  stopInitialNativeWatch = watch(nativeBusy, (busy) => { if (!busy) finishInitialNative() })
}
const state = createAdminSession({ closing: () => { nativeGeneration++; emit('closing') }, signedOut: () => emit('signedOut'), accessReload: () => emit('accessReload') }, async () => {
  const current = ++nativeGeneration
  if (initialNativeReady) await initialNativeReady
  // Superseded initial waiters and logout/disposal must not start late requests.
  if (disposed || current !== nativeGeneration) return
  await nativeState.value.refetch({ query: { disableCookieCache: true } })
  // Refetch resolves void; failures live on the reactive atom, not its return value.
  if (nativeState.value.error) throw new Error('Native session could not be confirmed')
})
const { session, loading, pending, uncertain, accessRequired, notice } = state
const focus = () => { void state.refresh() }
onMounted(() => { void state.refresh(); window.addEventListener('focus', focus) })
watch(() => props.refreshKey, focus)
onUnmounted(() => { disposed = true; nativeGeneration++; state.dispose(); finishInitialNative(); window.removeEventListener('focus', focus) })
</script>

<template>
  <section aria-label="Admin session" class="admin-session" :class="{ 'admin-session--attention': notice || uncertain || accessRequired }" :aria-busy="loading || pending">
    <span v-if="session && !notice" class="admin-session-status">Session active</span>
    <AdminSessionDisclosure :label="session?.user.name ?? (loading ? 'Checking…' : 'Account')">
      <div class="admin-session-identity">
        <p v-if="session">Signed in as <strong>{{ session.user.name }}</strong><span>{{ session.user.email }}</span></p>
        <p v-else>{{ loading ? 'Checking current session…' : 'No confirmed session' }}</p>
      </div>
      <button v-if="session || loading || pending || uncertain" data-testid="admin-sign-out" type="button" class="btn btn-link" :disabled="pending" @click="state.signOut">{{ pending ? 'Signing out…' : uncertain ? 'Retry sign-out' : 'Sign out' }}</button>
    </AdminSessionDisclosure>
    <div v-if="notice || loading || uncertain || !session || accessRequired" class="admin-session-recovery">
      <p v-if="loading" role="status">Checking current session…</p>
      <p v-if="notice" :role="uncertain ? 'alert' : 'status'">{{ notice }}</p>
      <div class="admin-session-actions">
        <button v-if="uncertain || !session" type="button" class="btn btn-link" :disabled="pending || loading" @click="state.refresh">Recheck session</button>
        <button v-if="(uncertain || accessRequired) && session" data-testid="admin-access-reload" type="button" class="btn btn-outline-primary" :disabled="pending || loading" @click="state.requestAccessReload">Reload access</button>
      </div>
    </div>
  </section>
</template>
