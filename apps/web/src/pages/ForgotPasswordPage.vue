<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import AuthLayout from '@web/components/auth/AuthLayout.vue'
import { authClient } from '@web/lib/auth-client'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'

const email = ref('')
const touched = ref(false)
const pending = ref(false)
const sent = ref(false)
const errorMessage = ref('')
const formEl = ref<HTMLFormElement | null>(null)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailError = computed(() => (EMAIL_PATTERN.test(email.value.trim()) ? '' : 'Enter a valid email address.'))
const showEmailError = computed(() => touched.value && emailError.value !== '')
// The field points at its own error and at the request error, so both are read with it.
const emailDescribedBy = computed(
  () =>
    [showEmailError.value ? 'forgot-email-error' : '', errorMessage.value ? 'forgot-error' : '']
      .filter(Boolean)
      .join(' ') || undefined,
)

const submit = async () => {
  touched.value = true
  if (pending.value) return
  if (emailError.value) {
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }
  pending.value = true
  errorMessage.value = ''
  try {
    // The email's link comes back to /reset-password?token=... on this site.
    const result = await authClient.requestPasswordReset({
      email: email.value.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (result.error) {
      errorMessage.value =
        result.error.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'Password reset is unavailable right now. Please try again later.'
    } else {
      sent.value = true
    }
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout>
    <h1 id="auth-page-title">Reset your password</h1>

    <!-- Same message whether or not the address has an account, so it can't be probed. -->
    <p v-if="sent" class="auth-page__notice" role="status">
      If an account exists for that email, we've sent a link to reset the password. The link
      expires in one hour.
    </p>

    <template v-else>
      <p class="auth-page__intro">Enter your email and we'll send you a reset link.</p>
      <form ref="formEl" novalidate @submit.prevent="submit">
        <div class="mb-3">
          <label for="forgot-email" class="form-label">Email</label>
          <input
            id="forgot-email"
            v-model="email"
            name="email"
            type="email"
            autocomplete="username"
            spellcheck="false"
            autocapitalize="none"
            class="form-control"
            :class="{ 'is-invalid': showEmailError }"
            :aria-invalid="showEmailError ? 'true' : undefined"
            :aria-describedby="emailDescribedBy"
            :disabled="pending"
            @blur="touched = true"
          />
          <div id="forgot-email-error" class="invalid-feedback">{{ emailError }}</div>
        </div>
        <!-- Always mounted so a new request error is announced. -->
        <div role="alert">
          <div v-if="errorMessage" id="forgot-error" class="alert alert-danger py-2">
            {{ errorMessage }}
          </div>
        </div>
        <BButton type="submit" variant="primary" class="w-100" :disabled="pending">
          {{ pending ? 'Sending…' : 'Send reset link' }}
        </BButton>
      </form>
    </template>

    <p class="auth-page__switch"><RouterLink :to="{ name: 'sign-in' }">Back to log in</RouterLink></p>
  </AuthLayout>
</template>
