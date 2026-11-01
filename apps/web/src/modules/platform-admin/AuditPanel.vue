<script setup lang="ts">
import { adminAuditActionSchema, adminSubjectTypeSchema } from '@broke-oclock/contracts/admin-common'
import { api } from '@web/lib/api-client'
import { type AuditDenial, type AuditList, useAudit } from '@web/modules/platform-admin/use-audit'
import { onUnmounted, useId, watch } from 'vue'

const props = withDefaults(defineProps<{ list?: AuditList; enabled?: boolean; accessKey?: number }>(), { enabled: true, accessKey: 0 })
const emit = defineEmits<{ denied: [code: AuditDenial] }>()
const audit = useAudit((query) => (props.list ?? api.platformAdmin.audit)(query), (code) => emit('denied', code))
const { filters, items, nextCursor, status, loading, validation } = audit
const prefix = useId()
const singaporeTime = (value: string) => new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'long',
}).format(new Date(value))
watch(() => [props.enabled, props.accessKey], () => {
  audit.close()
  if (props.enabled) void audit.load()
}, { immediate: true, flush: 'sync' })
onUnmounted(audit.dispose)
</script>

<template>
  <section class="card p-3 p-md-4 audit-panel" :aria-labelledby="`${prefix}-title`" :aria-busy="loading">
    <header class="mb-3">
      <p class="small text-uppercase text-secondary mb-1">Investigation / read only</p>
      <h2 :id="`${prefix}-title`" class="h4">Audit history</h2>
      <p class="mb-0 small">Newest records first. Dates use UTC; each entry also shows Asia/Singapore time. Audit records cannot be edited here.</p>
    </header>
    <p v-if="status === 'closed'" role="status">Audit access is closed. Recheck your session before reloading.</p>
    <p v-else-if="status === 'UNAUTHORIZED'" role="alert">Sign in again to view audit history.</p>
    <p v-else-if="status === 'FORBIDDEN'" role="alert">You do not have permission to view audit history.</p>
    <template v-else>
      <form class="row g-3 mb-4" @submit.prevent="audit.apply">
        <div class="col-12 col-md-6 col-xl-4">
          <label :for="`${prefix}-actor`" class="form-label">Actor ID</label>
          <input :id="`${prefix}-actor`" v-model="filters.actorId" name="actorId" class="form-control" maxlength="24" autocomplete="off" />
        </div>
        <div class="col-12 col-md-6 col-xl-4">
          <label :for="`${prefix}-action`" class="form-label">Action</label>
          <select :id="`${prefix}-action`" v-model="filters.action" name="action" class="form-select">
            <option value="">All actions</option>
            <option v-for="action in adminAuditActionSchema.options" :key="action" :value="action">{{ action.replaceAll('_', ' ') }}</option>
          </select>
        </div>
        <div class="col-12 col-md-6 col-xl-4">
          <label :for="`${prefix}-user`" class="form-label">Target account ID (legacy compatible)</label>
          <input :id="`${prefix}-user`" v-model="filters.userId" name="userId" class="form-control" maxlength="24" autocomplete="off" />
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-type`" class="form-label">Subject type</label>
          <select :id="`${prefix}-type`" v-model="filters.subjectType" name="subjectType" class="form-select">
            <option value="">All subjects</option>
            <option v-for="type in adminSubjectTypeSchema.options" :key="type" :value="type">{{ type.replaceAll('_', ' ') }}</option>
          </select>
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-subject`" class="form-label">Subject ID</label>
          <input :id="`${prefix}-subject`" v-model="filters.subjectId" name="subjectId" class="form-control" maxlength="24" autocomplete="off" />
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-from`" class="form-label">From, inclusive (UTC)</label>
          <input :id="`${prefix}-from`" v-model="filters.from" name="from" class="form-control" placeholder="2026-01-01T00:00:00Z" maxlength="30" :aria-describedby="`${prefix}-range`" />
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-until`" class="form-label">Until, exclusive (UTC)</label>
          <input :id="`${prefix}-until`" v-model="filters.until" name="until" class="form-control" placeholder="2026-01-02T00:00:00Z" maxlength="30" :aria-describedby="`${prefix}-range`" />
        </div>
        <p :id="`${prefix}-range`" class="small text-secondary my-2">Supply both dates in ISO UTC ending in Z, or leave both blank. Maximum interval: 90 days.</p>
        <p v-if="validation" role="alert" class="text-danger mb-0">{{ validation }}</p>
        <div class="d-flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary" :disabled="loading">Apply audit filters</button>
          <button type="button" class="btn btn-outline-primary" :disabled="loading" @click="audit.reset">Clear filters</button>
        </div>
      </form>
      <p v-if="loading" role="status">Loading audit history…</p>
      <div v-if="status === 'error'" role="alert" class="mb-3">
        <p>Unable to load audit history. No new results are available.</p>
        <button type="button" class="btn btn-outline-primary" data-testid="audit-retry" @click="audit.retry">Retry audit history</button>
      </div>
      <p v-if="status === 'ready' && !items.length" role="status">No audit entries match these filters.</p>
      <ol v-if="items.length" class="list-unstyled mb-0">
        <li v-for="entry in items" :key="entry.id" data-testid="audit-entry" class="border-top py-3 text-break">
          <h3 class="h6">{{ entry.action.replaceAll('_', ' ') }}</h3>
          <p class="mb-1">{{ entry.actorName }} <span class="small text-secondary">({{ entry.actorId }})</span></p>
          <p class="small mb-1">{{ entry.subjectType ?? (entry.targetUserId ? 'USER (legacy)' : 'Legacy subject') }}: {{ entry.subjectId ?? entry.targetUserId ?? 'Not recorded' }}</p>
          <p class="mb-2 audit-note">{{ entry.note }}</p>
          <p v-if="entry.roleBefore || entry.roleAfter" class="small mb-1">Role: {{ entry.roleBefore ?? 'Not recorded' }} to {{ entry.roleAfter ?? 'Not recorded' }}</p>
          <p v-if="entry.venueId" class="small mb-1">Outlet: {{ entry.venueId }}</p>
          <p class="small mb-1"><time :datetime="entry.createdAt">{{ entry.createdAt }} (UTC)</time><br />{{ singaporeTime(entry.createdAt) }} (Asia/Singapore)</p>
          <details v-if="entry.detailsJson" class="small mt-2">
            <summary>Recorded change details</summary>
            <dl class="mt-2 mb-0">
              <template v-for="(value, key) in entry.detailsJson" :key="key">
                <dt>{{ key }}</dt><dd>{{ Array.isArray(value) ? value.join(', ') : value }}</dd>
              </template>
            </dl>
          </details>
        </li>
      </ol>
      <button v-if="nextCursor" type="button" class="btn btn-outline-primary mt-3" data-testid="audit-more" :disabled="loading" @click="audit.load(true)">Load more audit entries</button>
    </template>
  </section>
</template>

<style scoped>
.audit-panel { min-width: 0; }
.audit-note { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
