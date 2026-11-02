<script setup lang="ts">
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { RouterLink } from 'vue-router'

withDefaults(defineProps<{ destination?: string; embedded?: boolean }>(), { destination: '/', embedded: false })
const emit = defineEmits<{ signedIn: [] }>()
</script>

<template>
  <SharedSignIn context="account" title="Welcome back" heading-level="h1" :destination="destination" :embedded="embedded" @signed-in="emit('signedIn')">
    <template #forgot><RouterLink class="auth-link" :to="{ name: 'forgot-password' }">Forgot password?</RouterLink></template>
    <template v-if="!embedded" #footer><p>New to Lobangers? <RouterLink class="auth-link" :to="{ name: 'register' }">Create an account</RouterLink></p></template>
  </SharedSignIn>
</template>
