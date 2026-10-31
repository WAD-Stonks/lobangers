<script setup lang="ts">
import type { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'

defineProps<{ s: ReturnType<typeof usePlatformAdmin> }>()
const emit = defineEmits<{ select: [string] }>()
</script>
<template>
  <section aria-label="Accounts" class="workspace-surface accounts-directory">
    <h2 class="visually-hidden">Accounts</h2>
    <form id="account-search-form" @submit.prevent="s.searchAccounts" class="directory-filters">
      <fieldset :disabled="s.busy">
        <div class="directory-search"><label for="account-search" class="form-label">Search accounts</label>
          <input id="account-search" v-model="s.accountSearch" maxlength="100" class="form-control" type="search" placeholder="Name or email" /></div>
        <div><label for="account-role-filter" class="form-label">Account role filter</label>
          <select id="account-role-filter" v-model="s.roleFilter" class="form-select"><option value="">All roles</option><option>USER</option><option>MERCHANT</option><option>MODERATOR</option><option>ADMIN</option></select></div>
        <button class="btn btn-outline-primary" type="submit">Search accounts</button>
        <button class="btn btn-outline-secondary" type="button" data-testid="clear-account-filters" :disabled="s.accounts.loading" @click="s.clearAccountFilters">Clear filters</button>
      </fieldset>
    </form>
    <p class="workspace-message small text-secondary">Applied filters are remembered until you reload or sign out.</p>
    <p v-if="s.accounts.loading" role="status" class="workspace-message">Loading accounts…</p>
    <p v-if="s.accounts.error" role="alert" class="workspace-message">{{ s.accounts.error }}</p>
    <p v-if="!s.accounts.loading && !s.accounts.error && !s.accounts.data?.items.length" class="workspace-message">No accounts match these filters.</p>
    <div class="records-scroll">
      <table aria-label="Account records" class="account-records">
        <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Actions</th></tr></thead>
        <tbody><tr v-for="account in s.accounts.data?.items" :key="account.id" :class="{ 'record-selected': s.selectedId === account.id }" :aria-selected="s.selectedId === account.id">
          <th scope="row"><span class="record-name">{{ account.name }}</span><span class="record-email">{{ account.email }}</span></th>
          <td><span class="record-role">{{ account.role }}</span></td>
          <td><button type="button" class="btn record-action" :data-testid="`account-${account.id}`" :disabled="s.busy" @click="emit('select', account.id)"><span class="visually-hidden">View account: {{ account.name }} ({{ account.email }})</span><span aria-hidden="true">View<span v-if="s.selectedId === account.id" class="visually-hidden"> selected account</span> →</span></button></td>
        </tr></tbody>
      </table>
    </div>
    <div v-if="s.accounts.data?.nextCursor" class="workspace-pagination"><button type="button" data-testid="more-accounts" class="btn btn-outline-secondary" :disabled="s.busy || s.accounts.loading" @click="s.loadAccounts(true)">Load more accounts</button></div>
  </section>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>
