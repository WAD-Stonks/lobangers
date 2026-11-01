<script setup lang="ts">
import type { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'

defineProps<{ s: ReturnType<typeof usePlatformAdmin> }>()
</script>
<template>
<div v-if="s.detail.data" class="access-panel">
        <h3 class="h5">Active stall grants</h3>
        <p v-if="!s.detail.data.grants.length">No active stall grants.</p>
        <ul><li v-for="grant in s.detail.data.grants" :key="grant.id">{{ grant.venueName }} / {{ grant.merchantName }} | Version {{ grant.version }} | {{ grant.createdAt }}</li></ul>
        <label for="account-action" class="form-label">Account action</label>
        <select id="account-action" v-model="s.action" :disabled="s.busy" class="form-select mb-3"><option value="role">Change role</option><option value="grant" :disabled="s.detail.data.role !== 'MERCHANT'">Grant stall access</option><option value="revoke">Revoke stall access</option></select>
        <div v-if="s.action === 'grant'">
          <p>A MERCHANT role alone grants no stall access. Choose one existing stall. You cannot grant yourself access.</p>
          <form id="venue-search-form" @submit.prevent="s.loadVenues()" class="mb-3">
            <label for="venue-search" class="form-label">Search existing stalls</label>
            <input id="venue-search" v-model="s.venueSearch" :disabled="s.busy" class="form-control mb-2" maxlength="100" />
            <button type="submit" class="btn btn-outline-primary" :disabled="s.busy">Search stalls</button>
          </form>
          <button type="button" v-if="s.venues.data?.nextCursor" data-testid="more-venues" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.venues.loading" @click="s.loadVenues(true)">Load more stalls</button>
          <p v-if="s.venues.loading" role="status">Loading stalls…</p>
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
            <select id="new-role" v-model="s.newRole" class="form-select mb-3"><option>USER</option><option>MERCHANT</option><option>MODERATOR</option><option>ADMIN</option></select>
            <p>Changing away from MERCHANT revokes outstanding stall grants. You cannot change your own role. The server protects the final administrator.</p>
            </template>
            <template v-if="s.action === 'grant'">
              <label for="venue-choice" class="form-label">Stall to grant</label>
              <select id="venue-choice" v-model="s.venueId" :disabled="s.venues.loading" class="form-select mb-3"><option value="">Choose a stall</option><option v-for="venue in s.venues.data?.items" :key="venue.id" :value="venue.id">{{ venue.name }} / {{ venue.merchantName }} / {{ venue.address }}</option></select>
            </template>
            <template v-if="s.action === 'revoke'">
              <label for="grant-choice" class="form-label">Active grant to revoke</label>
              <select id="grant-choice" v-model="s.grantId" class="form-select mb-3"><option value="">Choose an active grant</option><option v-for="grant in s.detail.data.grants" :key="grant.id" :value="grant.id">{{ grant.venueName }} / {{ grant.merchantName }}</option></select>
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