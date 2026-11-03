<script setup lang="ts">
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromValues, withLeading } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import type { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'

defineProps<{ s: ReturnType<typeof usePlatformAdmin> }>()
const emit = defineEmits<{ select: [string] }>()
const ROLE_OPTIONS = withLeading({ value: '', label: 'All roles' }, optionsFromValues(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN']))
</script>
<template>
  <section aria-label="Accounts" class="workspace-surface accounts-directory">
    <h2 class="visually-hidden">Accounts</h2>
    <form id="account-search-form" @submit.prevent="s.searchAccounts" class="directory-filters">
      <fieldset :disabled="s.busy">
        <div class="directory-search"><label for="account-search" class="form-label">Search accounts</label>
          <input id="account-search" v-model="s.accountSearch" name="account-search" autocomplete="off" spellcheck="false" maxlength="100" class="form-control" type="search" placeholder="Name or email…" /></div>
        <div><label for="account-role-filter" class="form-label">Account role filter</label>
          <AppSelect id="account-role-filter" v-model="s.roleFilter" name="account-role" :options="ROLE_OPTIONS" class="form-select" /></div>
        <button class="btn btn-outline-primary" type="submit">Search accounts</button>
        <button class="btn btn-outline-secondary" type="button" data-testid="clear-account-filters" :disabled="s.accounts.loading" @click="s.clearAccountFilters">Clear filters</button>
      </fieldset>
    </form>
    <p class="workspace-message small text-secondary">Applied filters are remembered until you reload or sign out.</p>
    <TicketLoading v-if="s.accounts.loading" class="workspace-message" label="Loading accounts…" />
    <p v-if="s.accounts.error" role="alert" class="workspace-message">{{ s.accounts.error }}</p>
    <p v-if="!s.accounts.loading && !s.accounts.error && !s.accounts.data?.items.length" class="workspace-message">No accounts match these filters.</p>
    <div class="records-scroll">
      <table aria-label="Account records" class="account-records">
        <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Actions</th></tr></thead>
        <tbody><tr v-for="account in s.accounts.data?.items" :key="account.id" :class="{ 'record-selected': s.selectedId === account.id }" :aria-current="s.selectedId === account.id ? 'true' : undefined">
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
