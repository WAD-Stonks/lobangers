<script setup lang="ts">
import AuthLobbie from '@web/components/auth/AuthLobbie.vue'
import GoogleSignUp from '@web/components/auth/GoogleSignUp.vue'
import '@web/components/auth/auth.css'
import { authClient } from '@web/lib/auth-client'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { computed, nextTick, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'

withDefaults(defineProps<{ peek?: boolean; destination?: string }>(), { peek: false, destination: '/deals' })
const emit = defineEmits<{ registered: [needsVerification: boolean] }>()

const form = reactive({ name: '', email: '', password: '', confirm: '' })
const touched = reactive({ name: false, email: false, password: false, confirm: false })
const pending = ref(false)
const submitError = ref('')
const formEl = ref<HTMLFormElement | null>(null)
const shown = reactive({ password: false, confirm: false })

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const errors = computed(() => ({
  name: form.name.trim() ? '' : 'Enter your name.',
  email: EMAIL_PATTERN.test(form.email.trim()) ? '' : 'Enter a valid email address.',
  password:
    form.password.length < 8
      ? 'Use at least 8 characters.'
      : form.password.length > 128
        ? 'Use at most 128 characters.'
        : '',
  confirm: form.confirm === form.password ? '' : 'Passwords do not match.',
}))
const isValid = computed(() => Object.values(errors.value).every((message) => !message))

const register = async () => {
  for (const key of Object.keys(touched) as (keyof typeof touched)[]) touched[key] = true
  if (pending.value) return
  if (!isValid.value) {
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }
  pending.value = true
  submitError.value = ''
  try {
    const result = await authClient.signUp.email({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      callbackURL: `${window.location.origin}/login?notice=verified`,
    })
    if (result.error) {
      submitError.value =
        result.error.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'We could not create that account. If you already registered, try logging in.'
    } else {
      emit('registered', result.data?.token === null)
    }
  } catch {
    submitError.value = 'Registration failed. Please try again.'
  } finally {
    form.password = ''
    form.confirm = ''
    shown.password = false
    shown.confirm = false
    pending.value = false
  }
}
</script>

<template>
  <AuthLobbie v-if="peek" :covering="shown.password || shown.confirm" />
  <form ref="formEl" class="card card-body p-4 auth-flow register-form" novalidate :aria-busy="pending" @submit.prevent="register">
    <h1 class="h3 mb-1">Create an account</h1>
    <p class="text-secondary mb-4">Save deals and share your own finds.</p>

    <div class="auth-form">
      <div>
        <label for="reg-name" class="form-label">Name</label>
        <input
          id="reg-name"
          v-model="form.name"
          name="name"
          type="text"
          autocomplete="name"
          maxlength="80"
          :placeholder="peek ? 'e.g. Alex Tan' : undefined"
          class="form-control"
          :aria-invalid="touched.name && !!errors.name"
          aria-describedby="reg-name-feedback"
          :disabled="pending"
          @blur="touched.name = true"
        />
        <p id="reg-name-feedback" class="auth-field-error" aria-live="polite">{{ touched.name ? errors.name : '' }}</p>
      </div>
      <div>
        <label for="reg-email" class="form-label">Email</label>
        <input
          id="reg-email"
          v-model="form.email"
          name="email"
          type="email"
          autocomplete="email"
          spellcheck="false"
          autocapitalize="none"
          :placeholder="peek ? 'you@example.com' : undefined"
          class="form-control"
          :aria-invalid="touched.email && !!errors.email"
          aria-describedby="reg-email-feedback"
          :disabled="pending"
          @blur="touched.email = true"
        />
        <p id="reg-email-feedback" class="auth-field-error" aria-live="polite">{{ touched.email ? errors.email : '' }}</p>
      </div>
      <div>
        <label for="reg-password" class="form-label">Password</label>
        <div class="auth-password">
          <input
            id="reg-password"
            v-model="form.password"
            name="password"
            :type="shown.password ? 'text' : 'password'"
            autocomplete="new-password"
            :placeholder="peek ? 'At least 8 characters' : undefined"
            class="form-control"
            :aria-invalid="touched.password && !!errors.password"
            aria-describedby="reg-password-feedback"
            :disabled="pending"
            @blur="touched.password = true"
          />
          <button
            type="button"
            class="auth-password-toggle"
            aria-controls="reg-password"
            :aria-pressed="shown.password"
            :aria-label="shown.password ? 'Hide password' : 'Show password'"
            data-testid="reg-password-toggle"
            @click="shown.password = !shown.password"
          >
            <svg v-if="shown.password" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.3 3.3M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>
        <p id="reg-password-feedback" class="auth-field-error" aria-live="polite">{{ touched.password ? errors.password : '' }}</p>
      </div>
      <div>
        <label for="reg-confirm" class="form-label">Confirm password</label>
        <div class="auth-password">
          <input
            id="reg-confirm"
            v-model="form.confirm"
            name="confirm"
            :type="shown.confirm ? 'text' : 'password'"
            autocomplete="new-password"
            :placeholder="peek ? 'Re-enter your password' : undefined"
            class="form-control"
            :aria-invalid="touched.confirm && !!errors.confirm"
            aria-describedby="reg-confirm-feedback"
            :disabled="pending"
            @blur="touched.confirm = true"
          />
          <button
            type="button"
            class="auth-password-toggle"
            aria-controls="reg-confirm"
            :aria-pressed="shown.confirm"
            :aria-label="shown.confirm ? 'Hide confirm password' : 'Show confirm password'"
            data-testid="reg-confirm-toggle"
            @click="shown.confirm = !shown.confirm"
          >
            <svg v-if="shown.confirm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.3 3.3M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>
        <p id="reg-confirm-feedback" class="auth-field-error" aria-live="polite">{{ touched.confirm ? errors.confirm : '' }}</p>
      </div>

      <p v-if="submitError" class="auth-error" role="alert">{{ submitError }}</p>
      <button type="submit" class="btn auth-primary" :disabled="pending">
        {{ pending ? 'Creating account…' : 'Sign up' }}
      </button>
      <GoogleSignUp :destination="destination" :disabled="pending" />
    </div>
    <p v-if="!peek" class="text-secondary small mt-3 mb-0">
      Already have an account? <RouterLink :to="{ name: 'login' }">Log in</RouterLink>
    </p>
  </form>
</template>

