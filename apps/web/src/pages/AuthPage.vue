<script setup lang="ts">
import AuthLayout from '@web/components/auth/AuthLayout.vue'
import LoginForm from '@web/modules/account/LoginForm.vue'
import RegisterForm from '@web/modules/account/RegisterForm.vue'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const props = defineProps<{ mode: 'login' | 'register' }>()
const route = useRoute()
const router = useRouter()
const notices: Record<string, string> = {
  verified: 'Your email is verified. You can log in now.',
  verify: 'Check your email for a link to verify your account, then log in.',
  reset: 'Your password was changed. Log in with the new one.',
}
const notice = computed(() => typeof route.query.notice === 'string' ? notices[route.query.notice] ?? '' : '')
const signedIn = () => router.replace('/deals')
const registered = (needsVerification: boolean) => needsVerification
  ? router.replace({ name: 'sign-in', query: { notice: 'verify' } })
  : router.replace('/deals')
</script>

<template>
  <AuthLayout>
    <h1 id="auth-page-title">{{ props.mode === 'login' ? 'Welcome back!' : 'Create an account' }}</h1>
    <p class="auth-page__intro">{{ props.mode === 'login' ? 'Log in to save deals and share your finds around Singapore.' : 'Save your favourite deals and share your finds around Singapore.' }}</p>
    <p v-if="notice" class="auth-page__notice" role="status">{{ notice }}</p>
    <LoginForm v-if="props.mode === 'login'" destination="/deals" embedded peek @signed-in="signedIn" />
    <RegisterForm v-else peek @registered="registered" />
    <p v-if="props.mode === 'login'" class="auth-page__switch">New here? <RouterLink :to="{ name: 'sign-up', query: route.query.redirect ? { redirect: route.query.redirect } : {} }">Create an account</RouterLink></p>
    <p v-else class="auth-page__switch">Already have an account? <RouterLink :to="{ name: 'sign-in', query: route.query.redirect ? { redirect: route.query.redirect } : {} }">Log in</RouterLink></p>
  </AuthLayout>
</template>
