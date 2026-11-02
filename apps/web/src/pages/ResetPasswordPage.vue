<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import AuthLayout from '@web/components/auth/AuthLayout.vue'
import { authClient } from '@web/lib/auth-client'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { computed, nextTick, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// Better Auth redirects here as /reset-password?token=... (or ?error=INVALID_TOKEN).
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const linkInvalid = computed(() => !token.value || route.query.error !== undefined)

const form = reactive({ password: '', confirm: '' })
const touched = reactive({ password: false, confirm: false })
const pending = ref(false)
const errorMessage = ref('')
const formEl = ref<HTMLFormElement | null>(null)

const errors = computed(() => ({
  password:
    form.password.length < 8
      ? 'Use at least 8 characters.'
      : form.password.length > 128
        ? 'Use at most 128 characters.'
        : '',
  confirm: form.confirm === form.password ? '' : 'Passwords do not match.',
}))

type Field = 'password' | 'confirm'
const showError = (field: Field) => touched[field] && errors.value[field] !== ''
// Each field points at its own error, and the new password also at the request error.
const describedBy = (field: Field) =>
  [
    showError(field) ? `reset-${field}-error` : '',
    field === 'password' && errorMessage.value ? 'reset-error' : '',
  ]
    .filter(Boolean)
    .join(' ') || undefined

const submit = async () => {
  touched.password = true
  touched.confirm = true
  if (pending.value) return
  if (errors.value.password || errors.value.confirm) {
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }
  pending.value = true
  errorMessage.value = ''
  try {
    const result = await authClient.resetPassword({
      newPassword: form.password,
      token: token.value,
    })
    if (result.error) {
      errorMessage.value = 'This reset link is invalid or has expired. Please request a new one.'
    } else {
      await router.replace({ name: 'login', query: { notice: 'reset' } })
    }
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
  } finally {
    form.password = ''
    form.confirm = ''
    pending.value = false
  }
}
</script>

<template>
  <AuthLayout>
    <h1 id="auth-page-title">Choose a new password</h1>
    <div v-if="linkInvalid" role="alert">
      <p class="auth-page__intro">This reset link is invalid or has expired.</p>
      <p class="auth-page__switch"><RouterLink :to="{ name: 'forgot-password' }">Request a new link</RouterLink></p>
    </div>

    <template v-else>
    <p class="auth-page__intro">Pick a new password for your account.</p>
    <form ref="formEl" novalidate @submit.prevent="submit">
      <div class="mb-3">
        <label for="reset-password" class="form-label">New password</label>
        <input
          id="reset-password"
          v-model="form.password"
          name="new-password"
          type="password"
          autocomplete="new-password"
          class="form-control"
          :class="{ 'is-invalid': showError('password') }"
          :aria-invalid="showError('password') ? 'true' : undefined"
          :aria-describedby="describedBy('password')"
          :disabled="pending"
          @blur="touched.password = true"
        />
        <div id="reset-password-error" class="invalid-feedback">{{ errors.password }}</div>
      </div>
      <div class="mb-3">
        <label for="reset-confirm" class="form-label">Confirm new password</label>
        <input
          id="reset-confirm"
          v-model="form.confirm"
          name="confirm-password"
          type="password"
          autocomplete="new-password"
          class="form-control"
          :class="{ 'is-invalid': showError('confirm') }"
          :aria-invalid="showError('confirm') ? 'true' : undefined"
          :aria-describedby="describedBy('confirm')"
          :disabled="pending"
          @blur="touched.confirm = true"
        />
        <div id="reset-confirm-error" class="invalid-feedback">{{ errors.confirm }}</div>
      </div>
      <!-- Always mounted so a new request error is announced. -->
      <div role="alert">
        <div v-if="errorMessage" id="reset-error" class="alert alert-danger py-2">
          {{ errorMessage }}
        </div>
      </div>
      <BButton type="submit" variant="primary" class="w-100" :disabled="pending">
        {{ pending ? 'Saving…' : 'Change password' }}
      </BButton>
    </form>
    </template>
  </AuthLayout>
</template>
