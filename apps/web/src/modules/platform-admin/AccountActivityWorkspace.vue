<script setup lang="ts">
import type { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'

defineProps<{ s: ReturnType<typeof usePlatformAdmin> }>()
</script>
<template>
<section aria-label="Audit history" class="workspace-surface">
        <h2 class="h4">Audit history</h2>
        <form id="audit-filter-form" @submit.prevent="s.filterAudit" class="mb-3">
          <label for="audit-user" class="form-label">Audit target account ID (blank for all)</label>
          <input id="audit-user" v-model="s.auditUser" :disabled="s.busy" class="form-control mb-2" maxlength="100" />
          <button class="btn btn-outline-primary" :disabled="s.busy" type="submit">Filter audit</button>
        </form>
        <p v-if="s.audit.loading" role="status">Loading audit history…</p>
        <p v-if="s.audit.error" role="alert">{{ s.audit.error }}</p>
        <p v-if="!s.audit.loading && !s.audit.error && !s.audit.data?.items.length">No audit events match this filter.</p>
        <ul class="list-unstyled"><li v-for="event in s.audit.data?.items" :key="event.id" class="border-top py-3">
          <p class="fw-semibold mb-1">{{ event.action }} <span v-if="event.roleBefore && event.roleAfter">{{ event.roleBefore }} → {{ event.roleAfter }}</span></p>
          <p class="mb-1">By {{ event.actorName }} ({{ event.actorId }}) for {{ event.targetUserId }}<span v-if="event.venueId"> | Stall {{ event.venueId }}</span></p>
          <p class="mb-1">{{ event.note }}</p><p class="small mb-0">{{ event.createdAt }}</p>
        </li></ul>
        <button type="button" v-if="s.audit.data?.nextCursor" data-testid="more-audit" class="btn btn-outline-secondary" :disabled="s.busy || s.audit.loading" @click="s.loadAudit(true)">Load more audit</button>
      </section>
</template>
<style scoped src="@web/modules/platform-admin/accounts-workspace.css"></style>