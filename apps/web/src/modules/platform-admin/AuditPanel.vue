<script setup lang="ts">
import { adminAuditActionSchema, adminSubjectTypeSchema } from '@broke-oclock/contracts/admin-common'
import AppSelect from '@web/components/AppSelect.vue'
import { type SelectOption, withLeading } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { isoToSingaporeInput, singaporeInputToIso } from '@web/lib/admin-date-input'
import { api } from '@web/lib/api-client'
import { type AuditDenial, type AuditInitialFilters, type AuditList, useAudit } from '@web/modules/platform-admin/use-audit'
import { computed, onUnmounted, reactive, useId, watch } from 'vue'

const spaced = (values: readonly string[]): readonly SelectOption[] =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ') }))
const ACTION_OPTIONS = withLeading({ value: '', label: 'All actions' }, spaced(adminAuditActionSchema.options))
const SUBJECT_OPTIONS = withLeading({ value: '', label: 'All subjects' }, spaced(adminSubjectTypeSchema.options))

const props = withDefaults(defineProps<{ list?: AuditList; enabled?: boolean; accessKey?: number; initialFilters?: AuditInitialFilters }>(), { enabled: true, accessKey: 0 })
const emit = defineEmits<{ denied: [code: AuditDenial] }>()
const audit = useAudit((query) => (props.list ?? api.platformAdmin.audit)(query), (code) => emit('denied', code))
const { filters, items, nextCursor, status, loading, validation } = audit
const prefix = useId()
const dateErrors = reactive({ from: '', until: '' })
const invalidDates = computed(() => Boolean(dateErrors.from || dateErrors.until))
const localDate = (field: 'from' | 'until') => computed({
  get: () => isoToSingaporeInput(filters[field]),
  set: (value: string) => {
    try {
      filters[field] = singaporeInputToIso(value) ?? ''
      dateErrors[field] = ''
    } catch {
      filters[field] = ''
      dateErrors[field] = 'Choose a valid date and time with a four-digit year in Singapore time.'
    }
  },
})
const fromDate = localDate('from')
const untilDate = localDate('until')
const applyFilters = () => { if (!invalidDates.value) void audit.apply() }
const resetFilters = () => { dateErrors.from = ''; dateErrors.until = ''; void audit.reset() }
const singaporeTime = (value: string) => new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'long',
}).format(new Date(value))
watch(() => [props.enabled, props.accessKey, props.initialFilters], () => {
  audit.close()
  dateErrors.from = ''
  dateErrors.until = ''
  if (props.enabled) void audit.initialize(props.initialFilters)
}, { immediate: true, flush: 'sync' })
onUnmounted(audit.dispose)
</script>

<template>
  <section class="card p-3 p-md-4 audit-panel" :aria-labelledby="`${prefix}-title`" :aria-busy="loading">
    <header class="mb-3">
      <p class="small text-uppercase text-secondary mb-1">Investigation / read only</p>
      <h2 :id="`${prefix}-title`" class="h4">Audit history</h2>
      <p class="mb-0 small">Explore who changed what and when. Filter in Singapore time; recorded timestamps remain available in UTC. This history is read only.</p>
    </header>
    <p v-if="status === 'closed'" role="status">Audit access is closed. Recheck your session before reloading.</p>
    <p v-else-if="status === 'UNAUTHORIZED'" role="alert">Sign in again to view audit history.</p>
    <p v-else-if="status === 'FORBIDDEN'" role="alert">You do not have permission to view audit history.</p>
    <template v-else>
      <form class="row g-3 mb-4" @submit.prevent="applyFilters">
        <div class="col-12 col-md-6 col-xl-4">
          <label :for="`${prefix}-action`" class="form-label">Action</label>
          <AppSelect :id="`${prefix}-action`" v-model="filters.action" name="action" :options="ACTION_OPTIONS" class="form-select" />
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-type`" class="form-label">Subject type</label>
          <AppSelect :id="`${prefix}-type`" v-model="filters.subjectType" name="subjectType" :options="SUBJECT_OPTIONS" class="form-select" />
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-from`" class="form-label">From (Singapore time)</label>
          <input :id="`${prefix}-from`" v-model="fromDate" name="from" type="datetime-local" step="0.001" max="9999-12-31T23:59:59.999" class="form-control" :aria-invalid="Boolean(dateErrors.from)" :aria-describedby="dateErrors.from ? `${prefix}-from-error` : `${prefix}-range`" />
          <p v-if="dateErrors.from" :id="`${prefix}-from-error`" role="alert" class="mt-2 mb-0">{{ dateErrors.from }}</p>
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-until`" class="form-label">Until, exclusive (Singapore time)</label>
          <input :id="`${prefix}-until`" v-model="untilDate" name="until" type="datetime-local" step="0.001" max="9999-12-31T23:59:59.999" class="form-control" :aria-invalid="Boolean(dateErrors.until)" :aria-describedby="dateErrors.until ? `${prefix}-until-error` : `${prefix}-range`" />
          <p v-if="dateErrors.until" :id="`${prefix}-until-error`" role="alert" class="mt-2 mb-0">{{ dateErrors.until }}</p>
        </div>
        <details class="col-12 admin-technical-details">
          <summary>Advanced filters · account and record IDs</summary>
          <div class="row g-3 mt-1">
        <div class="col-12 col-md-6 col-xl-4">
          <label :for="`${prefix}-actor`" class="form-label">Operator account ID</label>
          <input :id="`${prefix}-actor`" v-model="filters.actorId" name="actorId" class="form-control" maxlength="24" autocomplete="off" />
        </div>
        <div class="col-12 col-md-6 col-xl-4">
          <label :for="`${prefix}-user`" class="form-label">Target account ID</label>
          <input :id="`${prefix}-user`" v-model="filters.userId" name="userId" class="form-control" maxlength="24" autocomplete="off" spellcheck="false" autocapitalize="none" translate="no" />
        </div>
        <div class="col-12 col-md-6">
          <label :for="`${prefix}-subject`" class="form-label">Subject ID</label>
          <input :id="`${prefix}-subject`" v-model="filters.subjectId" name="subjectId" class="form-control" maxlength="24" autocomplete="off" spellcheck="false" autocapitalize="none" translate="no" />
        </div>
          </div>
        </details>
        <p :id="`${prefix}-range`" class="small text-secondary my-2">Choose both dates in Singapore time (SGT), or leave both blank. Maximum interval: 90 days.</p>
        <p v-if="validation" role="alert" class="text-danger mb-0">{{ validation }}</p>
        <div class="d-flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary" :disabled="loading || invalidDates">Apply audit filters</button>
          <button type="button" class="btn btn-outline-primary" :disabled="loading" @click="resetFilters">Clear filters</button>
        </div>
      </form>
      <TicketLoading v-if="loading" label="Loading audit history…" />
      <div v-if="status === 'error'" role="alert" class="mb-3">
        <p>Unable to load audit history. No new results are available.</p>
        <button type="button" class="btn btn-outline-primary" data-testid="audit-retry" @click="audit.retry">Retry audit history</button>
      </div>
      <p v-if="status === 'ready' && !items.length" role="status">No audit entries match these filters.</p>
      <ol v-if="items.length" class="list-unstyled mb-0">
        <li v-for="entry in items" :key="entry.id" data-testid="audit-entry" class="border-top py-3 text-break">
          <h3 class="h6">{{ entry.action.replaceAll('_', ' ') }}</h3>
          <p class="mb-1">{{ entry.actorName }} <span v-if="entry.actorKind === 'SYSTEM'" class="small text-secondary">(System policy / {{ entry.actorSource }})</span><span v-else class="small text-secondary" translate="no">({{ entry.actorId }})</span></p>
          <p class="small mb-1">{{ entry.subjectType ?? (entry.targetUserId ? 'USER (legacy)' : 'Legacy subject') }}: {{ entry.subjectId ?? entry.targetUserId ?? 'Not recorded' }}</p>
          <p class="mb-2 audit-note">{{ entry.note }}</p>
          <p v-if="entry.roleBefore || entry.roleAfter" class="small mb-1">Role: {{ entry.roleBefore ?? 'Not recorded' }} to {{ entry.roleAfter ?? 'Not recorded' }}</p>
          <p v-if="entry.venueId" class="small mb-1">Outlet: <span translate="no">{{ entry.venueId }}</span></p>
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
