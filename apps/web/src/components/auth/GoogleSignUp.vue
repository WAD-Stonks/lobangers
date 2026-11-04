<script setup lang="ts">
import type { AuthMethodsResponse } from '@broke-oclock/contracts/api'
import '@web/components/auth/auth.css'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { safeRedirect } from '@web/router/guards'
import { onMounted, onUnmounted, ref } from 'vue'

// Sign up with Google under the email form. Google makes the account on first use, so this is
// the same call as signing in; it only shows when the server has Google switched on.
const props = withDefaults(defineProps<{ destination?: string; disabled?: boolean }>(), { destination: '/deals', disabled: false })
const methods = ref<AuthMethodsResponse | null>(null)
const pending = ref(false)
const error = ref('')
let alive = true

onMounted(async () => {
  try { const result = await api.infrastructure.authMethods(); if (alive) methods.value = result }
  catch { /* No Google button: the email form still works. */ }
})
onUnmounted(() => { alive = false })

const google = async () => {
  if (pending.value || props.disabled || !methods.value?.google) return
  pending.value = true
  error.value = ''
  const destination = safeRedirect(props.destination, '/deals')
  const callback = new URL(destination, window.location.origin).href
  // A failed Google round trip lands on log in, which shows the error and keeps the destination.
  const errorCallback = new URL(`/login?redirect=${encodeURIComponent(destination)}`, window.location.origin).href
  try {
    const result = await authClient.signIn.social({ provider: 'google', callbackURL: callback, newUserCallbackURL: callback, errorCallbackURL: errorCallback })
    if (alive && result.error) error.value = 'Google sign-up could not be completed. Please try again.'
  } catch { if (alive) error.value = 'Google sign-up could not be completed. Please try again.' }
  finally { if (alive) pending.value = false }
}
</script>

<template>
  <template v-if="methods?.google">
    <div class="auth-divider"><span>or continue with</span></div>
    <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
    <button data-testid="google-sign-up" type="button" class="btn auth-secondary auth-google" :disabled="pending || disabled" @click="google">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" /><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59Z" /><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.88-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59C7.19 7.71 9.4 5.95 12 5.95Z" /></svg>
      {{ pending ? 'Opening Google…' : 'Continue with Google' }}
    </button>
  </template>
</template>
