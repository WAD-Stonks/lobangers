<script setup lang="ts">
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromValues, type SelectOption, withLeading } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { formatDateTime } from '@web/lib/format'
import type { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'
import { computed } from 'vue'

const props = defineProps<{ s: ReturnType<typeof usePlatformAdmin> }>()
const ROLE_OPTIONS = optionsFromValues(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'])
const actionOptions = computed<readonly SelectOption[]>(() => [
  { value: 'role', label: 'Change role' },
  { value: 'grant', label: 'Grant stall access', disabled: props.s.detail.data?.role !== 'MERCHANT' },
  { value: 'revoke', label: 'Revoke stall access' },
])
const venueOptions = computed(() =>
  withLeading(
    { value: '', label: 'Choose a stall' },
    (props.s.venues.data?.items ?? []).map((venue) => ({
      value: venue.id,
      label: `${venue.name} / ${venue.merchantName} / ${venue.address}`,
    })),
  ),
)
const grantOptions = computed(() =>
  withLeading(
    { value: '', label: 'Choose an active grant' },
    (props.s.detail.data?.grants ?? []).map((grant) => ({
      value: grant.id,
      label: `${grant.venueName} / ${grant.merchantName}`,
    })),
  ),
)
</script>
<template>
<div v-if="s.detail.data" class="access-panel">
        <h3 class="h5">Active stall grants</h3>
        <p v-if="!s.detail.data.grants.length">No active stall grants.</p>
        <ul><li v-for="grant in s.detail.data.grants" :key="grant.id">{{ grant.venueName }} / {{ grant.merchantName }} | Version {{ grant.version }} | <time :datetime="grant.createdAt">{{ formatDateTime(grant.createdAt) }}</time></li></ul>
        <label for="account-action" class="form-label">Account action</label>
        <AppSelect id="account-action" v-model="s.action" :options="actionOptions" :disabled="s.busy" class="form-select mb-3" />
        <div v-if="s.action === 'grant'">
          <p>A MERCHANT role alone grants no stall access. Choose one existing stall. You cannot grant yourself access.</p>
          <form id="venue-search-form" @submit.prevent="s.loadVenues()" class="mb-3">
            <label for="venue-search" class="form-label">Search existing stalls</label>
            <input id="venue-search" v-model="s.venueSearch" :disabled="s.busy" class="form-control mb-2" maxlength="100" />
            <button type="submit" class="btn btn-outline-primary" :disabled="s.busy">Search stalls</button>
          </form>
          <button type="button" v-if="s.venues.data?.nextCursor" data-testid="more-venues" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.venues.loading" @click="s.loadVenues(true)">Load more stalls</button>
          <TicketLoading v-if="s.venues.loading" label="Loading stalls…" />
          <p v-if="s.venues.error" role="alert">{{ s.venues.error }}</p>
          <p v-if="s.venues.data && !s.venues.loading && !s.venues.error && !s.venues.data.items.length" role="status">
            <template v-if="s.venues.data.nextCursor">No verified stalls on this page. Load more stalls to continue searching.</template>
            <template v-else>No existing stalls match this search.</template>
          </p>
        </div>
        <form id="account-action-form" @submit.prevent="s.submitAccountAction">
          <fieldset :disabled="s.busy || s.detail.loading">
            <template v-if="s.action === 'role'">
            <label for="new-role" class="form-label">New role</label>
            <AppSelect id="new-role" v-model="s.newRole" :options="ROLE_OPTIONS" class="form-select mb-3" />
            <p>Changing away from MERCHANT revokes outstanding stall grants. You cannot change your own role. The server protects the final administrator.</p>
            </template>
            <template v-if="s.action === 'grant'">
              <label for="venue-choice" class="form-label">Stall to grant</label>
              <AppSelect id="venue-choice" v-model="s.venueId" :options="venueOptions" :disabled="s.venues.loading" class="form-select mb-3" />
            </template>
            <template v-if="s.action === 'revoke'">
              <label for="grant-choice" class="form-label">Active grant to revoke</label>
              <AppSelect id="grant-choice" v-model="s.grantId" :options="grantOptions" class="form-select mb-3" />
            </template>
            <label for="account-note" class="form-label">Account action note (required)</label>
            <textarea id="account-note" v-model="s.note" required maxlength="500" class="form-control mb-3" />
            <label class="d-block mb-3"><input id="account-confirm" v-model="s.confirmed" type="checkbox" /> Confirm {{ s.actionLabel }} for {{ s.detail.data.email }}: {{ s.actionTarget }}</label>
            <button type="submit" class="btn btn-primary" :disabled="!s.accountReady || !s.actionValid">{{ s.actionLabel }}</button>
          </fieldset>
        </form>
</div>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>