<script setup lang="ts">
import type { AuthMethodsResponse } from '@broke-oclock/contracts/api'
import PasswordRecovery from '@web/components/auth/PasswordRecovery.vue'
import '@web/components/auth/auth.css'
import { consumeOAuthError, safeAuthDestination } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { safeRedirect } from '@web/router/guards'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  destination?: string
  context?: 'admin' | 'account'
  headingLevel?: 'h1' | 'h2'
  embedded?: boolean
}>(), { title: 'Sign in', destination: '/', context: 'admin', headingLevel: 'h2' })
const emit = defineEmits<{ signedIn: [] }>()
const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref(consumeOAuthError(props.context === 'account'))
const notice = ref('')
const recovery = ref(false)
const code = ref('')
const issuedEmail = ref('')
const cooldown = ref(0)
const emailInput = ref<HTMLInputElement>()
const passwordInput = ref<HTMLInputElement>()
const codeInput = ref<HTMLInputElement>()
const errorMessage = ref<HTMLElement>()
const touched = ref(false)
const emailId = computed(() => props.context === 'account' ? 'login-email' : 'admin-email')
const passwordId = computed(() => props.context === 'account' ? 'login-password' : 'admin-password')
const emailError = computed(() => !email.value.trim() ? 'Enter your email address.' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Enter a valid email address.')
const timer = setInterval(() => { if (cooldown.value > 0) cooldown.value-- }, 1000)
const methods = ref<AuthMethodsResponse | null>(null)
const methodsUnavailable = ref(false)
const method = ref<'code' | 'password'>('code')
const passwordMode = computed(() => method.value === 'password' || methodsUnavailable.value || methods.value?.emailOtp === false)
let generation = 0
let alive = true
watch(email, () => { generation++; password.value = ''; code.value = ''; issuedEmail.value = ''; error.value = ''; notice.value = ''; cooldown.value = 0 }, { flush: 'sync' })
onMounted(async () => {
  try { const result = await api.infrastructure.authMethods(); if (alive) methods.value = result }
  catch { if (alive) methodsUnavailable.value = true }
})
onUnmounted(() => { alive = false; generation++; clearInterval(timer); password.value = ''; code.value = '' })
watch(recovery, () => { generation++; password.value = ''; code.value = ''; issuedEmail.value = ''; error.value = ''; notice.value = ''; cooldown.value = 0 }, { flush: 'sync' })
watch(recovery, async (open) => {
  if (!open) {
    await nextTick()
    if (alive) emailInput.value?.focus()
  }
})
watch(error, async (value) => { if (value) { await nextTick(); if (alive) errorMessage.value?.focus() } })
const validEmail = () => {
  touched.value = true
  if (emailError.value) { emailInput.value?.focus(); return false }
  return true
}
const signIn = async () => {
  if (pending.value || !validEmail() || !password.value) return
  const current = ++generation
  pending.value = true
  error.value = ''
  try {
    const result = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
    if (!alive || current !== generation) return
    if (result.error) error.value = result.error.status === 429
      ? 'Too many attempts. Please wait a minute and try again.'
      : result.error.status === 403
        ? 'Please verify your email first. We have sent you a new link.'
        : 'Sign-in failed. Check your credentials and try again.'
    else emit('signedIn')
  } catch { if (alive && current === generation) error.value = 'Sign-in failed. Please try again.' }
  finally { password.value = ''; if (alive) pending.value = false }
}
const google = async () => {
  if (pending.value || !methods.value?.google) return
  const current = ++generation
  pending.value = true; error.value = ''; password.value = ''; code.value = ''
  // Keep the admin exact allowlist. Only the public account entry accepts safe SPA paths.
  const destination = safeRedirect(props.destination)
  const candidate = new URL(destination, window.location.origin)
  const callback = props.context === 'account'
    ? candidate.origin === window.location.origin ? candidate.href : new URL('/', window.location.origin).href
    : safeAuthDestination(props.destination, window.location.origin)
  const errorCallback = props.context === 'account'
    ? new URL(`/login?redirect=${encodeURIComponent(candidate.origin === window.location.origin ? destination : '/')}`, window.location.origin).href
    : callback
  try {
    const result = await authClient.signIn.social({ provider: 'google', callbackURL: callback, newUserCallbackURL: callback, errorCallbackURL: errorCallback })
    if (alive && current === generation && result.error) error.value = 'Google sign-in could not be completed. Please try again.'
  } catch { if (alive && current === generation) error.value = 'Google sign-in could not be completed. Please try again.' }
  finally { if (alive) pending.value = false }
}
const sendCode = async () => {
  if (pending.value || cooldown.value || !methods.value?.emailOtp || !validEmail()) return
  const current = ++generation
  const mailbox = email.value.trim()
  pending.value = true; error.value = ''; code.value = ''; password.value = ''
  try {
    const result = await authClient.emailOtp.sendVerificationOtp({ email: mailbox, type: 'sign-in' })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Code could not be sent. Please try again.'
    else { issuedEmail.value = mailbox; cooldown.value = 30 }
  } catch { if (alive && current === generation) error.value = 'Code could not be sent. Please try again.' }
  finally {
    if (alive) pending.value = false
    await nextTick()
    if (alive && current === generation && issuedEmail.value && !error.value) codeInput.value?.focus()
  }
}
const redeemCode = async () => {
  if (pending.value || !methods.value?.emailOtp || !issuedEmail.value || issuedEmail.value !== email.value.trim() || !/^\d{6}$/.test(code.value)) return
  const current = ++generation
  pending.value = true; error.value = ''
  try {
    const result = await authClient.signIn.emailOtp({ email: issuedEmail.value, otp: code.value })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Code sign-in could not be completed. Try again or request a new code.'
    else emit('signedIn')
  } catch { if (alive && current === generation) error.value = 'Code sign-in could not be completed. Please try again.' }
  finally { code.value = ''; password.value = ''; if (alive) pending.value = false }
}
const switchMethod = async (next: 'code' | 'password', focusEmail = false) => {
  if (pending.value) return
  generation++; method.value = next; issuedEmail.value = ''; code.value = ''; password.value = ''; error.value = ''; notice.value = ''
  await nextTick()
  if (alive) {
    const input = !focusEmail && next === 'password' && email.value.trim() ? passwordInput.value : emailInput.value
    input?.focus()
  }
}
const recovered = () => { recovery.value = false; notice.value = 'Password reset. Sign in again with your new password.' }
</script>

<template>
  <section :aria-labelledby="recovery ? 'recovery-title' : embedded ? undefined : 'sign-in-title'" :aria-label="!recovery && embedded ? title : undefined" class="shared-sign-in" :class="{ 'auth-card': !embedded }">
    <PasswordRecovery v-if="recovery" :heading-level="embedded ? 'h2' : headingLevel" @completed="recovered" @cancel="recovery = false" />
    <div v-else class="auth-flow">
      <header v-if="!embedded" class="auth-header">
        <component :is="headingLevel" id="sign-in-title" class="auth-title">{{ issuedEmail ? 'Check your inbox' : title }}</component>
        <p class="auth-description">{{ issuedEmail ? 'Use the six-digit code sent to your email to sign in.' : description || (context === 'account' ? 'Sign in to keep your favourite deals close.' : 'Sign in with your account to continue to administration.') }}</p>
      </header>
      <p v-if="methodsUnavailable" role="status" class="auth-notice">Other sign-in methods are unavailable. You can still sign in with your password.</p>
      <p v-if="notice" role="status" class="auth-notice">{{ notice }}</p>
      <p v-if="error" id="sign-in-error" ref="errorMessage" role="alert" tabindex="-1" class="auth-error">{{ error }}</p>
      <template v-if="!issuedEmail">
        <form novalidate @submit.prevent="passwordMode ? signIn() : sendCode()" :aria-busy="pending" class="auth-form">
          <div>
            <label :for="emailId" class="form-label">Email</label>
            <input :id="emailId" ref="emailInput" v-model="email" type="email" autocomplete="username" class="form-control" :disabled="context === 'account' && pending" :aria-invalid="touched && !!emailError" :aria-describedby="touched && emailError ? 'sign-in-email-error' : undefined" required @blur="touched = true" />
            <p id="sign-in-email-error" class="auth-field-error" aria-live="polite">{{ touched ? emailError : '' }}</p>
          </div>
          <div v-if="passwordMode">
            <div class="auth-label-row">
              <label :for="passwordId" class="form-label">Password</label>
              <button v-if="methods?.passwordRecovery" data-testid="recovery-open" type="button" class="auth-link" :disabled="pending" @click="recovery = true">Forgot password?</button>
              <slot v-else name="forgot" />
            </div>
            <input :id="passwordId" ref="passwordInput" v-model="password" type="password" autocomplete="current-password" class="form-control" :disabled="pending" required />
          </div>
          <button v-if="passwordMode" class="btn auth-primary" type="submit" :disabled="pending || !password">{{ pending ? 'Signing in…' : context === 'account' ? 'Log in' : 'Sign in' }}</button>
          <button v-else data-testid="otp-send" type="submit" class="btn auth-primary" :disabled="pending || !methods?.emailOtp || cooldown > 0">{{ pending ? 'Sending code…' : cooldown ? `Resend in ${cooldown}s` : methods ? 'Email me a sign-in code' : 'Checking sign-in options…' }}</button>
        </form>
        <button v-if="!passwordMode" data-testid="use-password" type="button" class="auth-link auth-back" :disabled="pending" @click="switchMethod('password')">Use password instead</button>
        <button v-else-if="methods?.emailOtp" data-testid="use-code" type="button" class="auth-link auth-back" :disabled="pending" @click="switchMethod('code')">Use an email code instead</button>
        <template v-if="methods?.google">
          <div class="auth-divider"><span>or continue with</span></div>
          <button data-testid="google-sign-in" type="button" class="btn auth-secondary auth-google" :disabled="pending" @click="google">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22ZM6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59ZM12 5.95c1.47 0 2.79.51 3.83 1.51l2.88-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59C7.19 7.71 9.4 5.95 12 5.95Z" /></svg>
            Continue with Google
          </button>
        </template>
      </template>
      <template v-else>
        <div class="auth-mailbox"><span>{{ issuedEmail }}</span><button data-testid="change-email" type="button" class="auth-link" :disabled="pending" @click="switchMethod('code', true)">Change email</button></div>
        <form data-testid="otp-form" @submit.prevent="redeemCode" :aria-busy="pending" class="auth-form">
          <div>
            <label for="sign-in-code" class="form-label">Sign-in code</label>
            <input id="sign-in-code" ref="codeInput" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="form-control auth-code" :disabled="pending" aria-describedby="sign-in-code-help" required />
            <p id="sign-in-code-help" class="auth-help">Enter all six digits, including any leading zero.</p>
          </div>
          <button type="submit" class="btn auth-primary" :disabled="pending || !/^\d{6}$/.test(code)">{{ pending ? 'Signing in…' : 'Sign in with code' }}</button>
        </form>
        <div class="auth-resend" aria-live="polite"><span>Didn't get a code?</span><button data-testid="otp-resend" type="button" class="auth-link" :disabled="pending || cooldown > 0" @click="sendCode">{{ cooldown ? `Resend in ${cooldown}s` : 'Resend sign-in code' }}</button></div>
        <button data-testid="use-password" type="button" class="auth-link auth-back" :disabled="pending" @click="switchMethod('password')">Use password instead</button>
      </template>
      <details v-if="methods?.emailOtp" class="auth-method-note"><summary>About code sign-in</summary><p>For an existing unverified account, first code sign-in can remove previous sign-in links, password and sessions. Use password recovery to set a new password. Administrator access still requires separate approval.</p></details>
      <p v-if="context === 'admin'" class="auth-role-note">Administrator and merchant access must be approved separately.</p>
      <footer v-if="$slots.footer" class="auth-footer"><slot name="footer" /></footer>
    </div>
  </section>
</template>
