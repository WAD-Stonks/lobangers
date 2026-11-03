<script setup lang="ts">
import type { AccountProfile } from '@broke-oclock/contracts/account'
import { BButton } from '@broke-oclock/ui'
import TicketLoading from '@web/components/TicketLoading.vue'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { formatDate } from '@web/lib/format'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const profile = ref<AccountProfile | null>(null)
const loading = ref(true)
const notLoggedIn = ref(false)
const errorMessage = ref('')

const name = ref('')
const saving = ref(false)
const saveError = ref('')
const saveNotice = ref('')

const roleLabel: Record<string, string> = {
  USER: 'Regular user',
  MERCHANT: 'Merchant',
  MODERATOR: 'Moderator',
  ADMIN: 'Platform admin',
}

const loadProfile = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    profile.value = await api.account.profile()
    name.value = profile.value.name
  } catch (error) {
    if (errorCode(error) === 'UNAUTHORIZED') {
      notLoggedIn.value = true
    } else {
      errorMessage.value = 'Could not load your profile. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

// Only the display name is editable here. Email and role are never sent from this form.
const saveName = async () => {
  const trimmed = name.value.trim()
  saveError.value = ''
  saveNotice.value = ''
  if (trimmed.length < 1 || trimmed.length > 80) {
    saveError.value = 'Enter a name between 1 and 80 characters.'
    return
  }
  saving.value = true
  try {
    const result = await authClient.updateUser({ name: trimmed })
    if (result.error) {
      saveError.value = 'Could not update your name. Please try again.'
    } else {
      saveNotice.value = 'Name updated.'
      await loadProfile()
    }
  } catch {
    saveError.value = 'Could not update your name. Please try again.'
  } finally {
    saving.value = false
  }
}

onMounted(loadProfile)
</script>

<template>
  <section class="container py-4 profile-page" aria-labelledby="profile-title">
    <h1 id="profile-title" class="h2 mb-4">My profile</h1>

    <TicketLoading v-if="loading" label="Loading your profile…" />
    <p v-else-if="notLoggedIn">Please <RouterLink to="/login">log in</RouterLink> to see your profile.</p>
    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadProfile">Retry</button>
    </div>

    <div v-else-if="profile" class="card card-body">
      <dl class="row mb-4">
        <dt class="col-sm-3">Email</dt>
        <dd class="col-sm-9 text-break">{{ profile.email }}</dd>
        <dt class="col-sm-3">Account type</dt>
        <dd class="col-sm-9">{{ roleLabel[profile.role] ?? profile.role }}</dd>
        <dt class="col-sm-3">Member since</dt>
        <dd class="col-sm-9">{{ formatDate(profile.createdAt) }}</dd>
      </dl>

      <form novalidate @submit.prevent="saveName">
        <label for="profile-name" class="form-label">Display name</label>
        <div class="input-group mb-2">
          <input
            id="profile-name"
            v-model="name"
            name="nickname"
            autocomplete="nickname"
            maxlength="80"
            class="form-control"
            :class="{ 'is-invalid': saveError }"
            :aria-invalid="saveError ? 'true' : undefined"
            :aria-describedby="saveError ? 'profile-name-error' : undefined"
            :disabled="saving"
          />
          <BButton type="submit" variant="primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save name' }}</BButton>
        </div>
        <!-- Always mounted so a save error is announced; the field points at it. -->
        <div role="alert">
          <p v-if="saveError" id="profile-name-error" class="text-danger small mb-0">{{ saveError }}</p>
        </div>
        <p v-if="saveNotice" class="text-success small mb-0" role="status">{{ saveNotice }}</p>
      </form>

      <!-- Saved and Submitted have their own tabs; only the role's merchant link stays here. -->
      <template v-if="profile.role === 'MERCHANT' || profile.role === 'USER'">
        <hr />
        <p class="mb-0 small">
          <RouterLink v-if="profile.role === 'MERCHANT'" to="/merchant">Merchant dashboard</RouterLink>
          <RouterLink v-else to="/me/merchant-access">Merchant access</RouterLink>
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* A readable width on wide screens; the input group still fills a phone. */
.profile-page {
  max-width: 52rem;
}
</style>
