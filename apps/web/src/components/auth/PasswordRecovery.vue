<script setup lang="ts">
import '@web/components/auth/auth.css'
import { authClient } from '@web/lib/auth-client'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

withDefaults(defineProps<{ title?: string; headingLevel?: 'h1' | 'h2' }>(), { title: 'Reset your password', headingLevel: 'h2' })
const emit = defineEmits<{ completed: []; cancel: [] }>()
const email = ref('')
const code = ref('')
const password = ref('')
const issuedEmail = ref('')
const pending = ref(false)
const error = ref('')
const cooldown = ref(0)
const emailInput = ref<HTMLInputElement>()
const codeInput = ref<HTMLInputElement>()
onMounted(() => emailInput.value?.focus())
const errorMessage = ref<HTMLElement>()
watch(error, async (value) => { if (value) { await nextTick(); if (alive) errorMessage.value?.focus() } })
let generation = 0
let alive = true
const timer = setInterval(() => { if (cooldown.value > 0) cooldown.value-- }, 1000)
watch(email, () => { generation++; issuedEmail.value = ''; code.value = ''; password.value = ''; error.value = ''; cooldown.value = 0 }, { flush: 'sync' })
onUnmounted(() => { alive = false; generation++; clearInterval(timer); code.value = ''; password.value = '' })
const request = async () => {
  if (pending.value || cooldown.value || !email.value.trim()) return
  const current = ++generation
  const mailbox = email.value.trim()
  pending.value = true; error.value = ''; code.value = ''; password.value = ''
  try {
    const result = await authClient.emailOtp.requestPasswordReset({ email: mailbox })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Recovery could not be started. Please try again.'
    else { issuedEmail.value = mailbox; cooldown.value = 30 }
  } catch { if (alive && current === generation) error.value = 'Recovery could not be started. Please try again.' }
  finally {
    if (alive) pending.value = false
    await nextTick()
    if (alive && current === generation && issuedEmail.value && !error.value) codeInput.value?.focus()
  }
}
const reset = async () => {
  if (pending.value || issuedEmail.value !== email.value.trim() || !/^\d{6}$/.test(code.value) || password.value.length < 8) return
  const current = ++generation
  pending.value = true; error.value = ''
  try {
    const result = await authClient.emailOtp.resetPassword({ email: issuedEmail.value, otp: code.value, password: password.value })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Password reset could not be confirmed. Request a new code or try again.'
    else emit('completed')
  } catch { if (alive && current === generation) error.value = 'Password reset could not be confirmed. Please try again.' }
  finally { code.value = ''; password.value = ''; if (alive) pending.value = false }
}
</script>

<template>
  <section aria-labelledby="recovery-title" class="auth-flow">
    <header class="auth-header">
      <component :is="headingLevel" id="recovery-title" class="auth-title">{{ title }}</component>
      <p class="auth-description">If the account can receive recovery email, a code will be sent. Resetting your password ends existing sessions.</p>
    </header>
    <p v-if="error" ref="errorMessage" tabindex="-1" role="alert" class="auth-error">{{ error }}</p>
    <form data-testid="recovery-request" @submit.prevent="request" :aria-busy="pending" class="auth-form">
      <div>
        <label for="recovery-email" class="form-label">Email</label>
        <input id="recovery-email" ref="emailInput" v-model="email" type="email" autocomplete="username" class="form-control" required />
      </div>
      <button type="submit" class="btn" :class="issuedEmail ? 'auth-secondary' : 'auth-primary'" :disabled="pending || cooldown > 0">{{ cooldown ? `Resend in ${cooldown}s` : pending && !issuedEmail ? 'Sending recovery code…' : issuedEmail ? 'Resend recovery code' : 'Send recovery code' }}</button>
    </form>
    <form v-if="issuedEmail" data-testid="recovery-reset" @submit.prevent="reset" :aria-busy="pending" class="auth-form mt-4">
      <p role="status" class="auth-help">If recovery is available, check your email for a six-digit recovery code.</p>
      <div>
        <label for="recovery-code" class="form-label">Recovery code</label>
        <input id="recovery-code" ref="codeInput" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="form-control auth-code" :disabled="pending" required />
      </div>
      <div>
        <label for="recovery-password" class="form-label">New password</label>
        <input id="recovery-password" v-model="password" type="password" autocomplete="new-password" minlength="8" class="form-control" :disabled="pending" aria-describedby="recovery-password-help" required />
        <p id="recovery-password-help" class="auth-help">Use at least 8 characters.</p>
      </div>
      <button type="submit" class="btn auth-primary" :disabled="pending">{{ pending ? 'Resetting password…' : 'Reset password' }}</button>
    </form>
    <button data-testid="recovery-cancel" type="button" class="auth-link auth-back" :disabled="pending" @click="!pending && emit('cancel')">Return to sign-in</button>
  </section>
</template>
