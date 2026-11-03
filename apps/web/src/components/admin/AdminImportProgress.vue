<script setup lang="ts">
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import { backgroundImport } from '@web/modules/ingestion-admin/background-import'

const { state, active } = backgroundImport
</script>

<template>
  <section v-if="state.phase !== 'idle'" class="admin-import-progress" aria-label="Import progress" data-testid="import-progress">
    <header>
      <div class="import-progress-title"><span v-if="active" class="spinner-border spinner-border-sm" aria-hidden="true" /><strong>{{ active ? 'Import in progress' : state.phase === 'failed' ? 'Import needs attention' : 'Import complete' }}</strong></div>
      <button v-if="!active" type="button" class="btn btn-link" aria-label="Dismiss import progress" @click="backgroundImport.dismiss">Dismiss</button>
    </header>
    <p role="status">{{ state.message }}</p>
    <p v-if="state.readError" role="alert">{{ state.readError }}</p>
    <p v-if="state.result" class="import-progress-summary">Fetched {{ state.result.fetchedCount }} · Created {{ state.result.createdCount }} · Updated {{ state.result.updatedCount }} · Failed {{ state.result.failedCount }}</p>
    <ul v-if="state.runs.length" class="import-progress-sources">
      <li v-for="run in state.runs" :key="run.id">
        <div><strong>{{ run.sourceName }}</strong><AdminStatusBadge :status="run.status" /></div>
        <p>Fetched {{ run.fetchedCount }} · Created {{ run.createdCount }} · Updated {{ run.updatedCount }} · Failed {{ run.failedCount }}</p>
      </li>
    </ul>
    <footer><AdminTaskLink to="/admin/ingestion#runs-title">View run history →</AdminTaskLink><button type="button" class="btn btn-link" :disabled="state.refreshing" @click="backgroundImport.refresh">{{ state.refreshing ? 'Checking…' : 'Refresh progress' }}</button></footer>
  </section>
</template>

<style scoped>
.admin-import-progress { padding: 16px 20px; margin-bottom: 24px; border: 1px solid var(--admin-accent-border-strong); border-radius: 16px; background: var(--admin-accent-wash); overflow-wrap: anywhere; }
header, footer, .import-progress-title, .import-progress-sources li > div { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
header { justify-content: space-between; }
p { margin: 8px 0 0; font-size: .875rem; }
footer { margin-top: 12px; justify-content: space-between; font-size: .875rem; }
.import-progress-sources { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 12px; }
.import-progress-sources li { padding-top: 12px; border-top: 1px solid var(--admin-accent-border-strong); }
.import-progress-sources p { color: var(--admin-muted); }
.import-progress-sources strong { font-size: .875rem; }
@media (prefers-reduced-motion: reduce) { .spinner-border { animation: none; } }
</style>
