<script setup lang="ts">
import AppSelect from '@web/components/AppSelect.vue'
import { optionsFromValues, type SelectOption, withLeading } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { formatDateTime } from '@web/lib/format'
import { useModeration } from '@web/modules/admin-moderation/use-moderation'

const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const {
  mode,
  targetType,
  status,
  state,
  reason,
  dealId,
  reports,
  comments,
  report,
  comment,
  nextCursor,
  loading,
  detailLoading,
  pending,
  error,
  notice,
  note,
  confirmed,
  decision,
  selected,
  blocked,
  lockMessage,
  load,
  inspect,
  submit,
  resetConsent,
} = useModeration((code) => emit('denied', code))
const QUEUE_OPTIONS: readonly SelectOption[] = [
  { value: 'REPORTS', label: 'Reports' },
  { value: 'COMMENTS', label: 'Comments' },
]
const TARGET_OPTIONS: readonly SelectOption[] = [
  { value: 'COMMENT', label: 'Comment reports' },
  { value: 'DEAL', label: 'Deal reports' },
]
const STATUS_OPTIONS = optionsFromValues(['OPEN', 'RESOLVED', 'DISMISSED'])
const REASON_OPTIONS = withLeading(
  { value: '', label: 'All reasons' },
  optionsFromValues(['SPAM', 'MISLEADING', 'INAPPROPRIATE', 'OTHER']),
)
const STATE_OPTIONS = optionsFromValues(['VISIBLE', 'HIDDEN', 'AUTHOR_DELETED'])
const DECISION_OPTIONS: readonly SelectOption[] = [
  { value: 'RESOLVED', label: 'Resolve report only' },
  { value: 'DISMISSED', label: 'Dismiss report only' },
]
</script>
<template>
<section class="moderation-panel" aria-label="Reports and comment moderation">
 <p class="scope-note">Reports currently concern a whole deal or an individual comment, not a verified outlet. Report decisions do not hide content or resolve other reports.</p>
 <p><a href="/admin/deals">Open global deal publication controls</a>. Unpublishing a deal affects the whole promotion across its chain/outlets; investigate scope explicitly. Never infer an outlet from a report.</p>
 <form class="row g-3 mb-4" @submit.prevent="load(false)">
  <div class="col-sm-4"><label for="mod-queue" class="form-label">Queue</label><AppSelect id="mod-queue" v-model="mode" :options="QUEUE_OPTIONS" class="form-select" :disabled="pending" @change="load(false)" /></div>
  <template v-if="mode==='REPORTS'">
   <div class="col-sm-4"><label for="mod-type" class="form-label">Report collection</label><AppSelect id="mod-type" v-model="targetType" :options="TARGET_OPTIONS" class="form-select" :disabled="pending" @change="load(false)" /></div>
   <div class="col-sm-4"><label for="mod-status" class="form-label">Report status</label><AppSelect id="mod-status" v-model="status" :options="STATUS_OPTIONS" class="form-select" :disabled="pending" @change="load(false)" /></div>
   <div class="col-sm-4"><label for="mod-reason" class="form-label">Reason</label><AppSelect id="mod-reason" v-model="reason" :options="REASON_OPTIONS" class="form-select" :disabled="pending" /></div>
  </template>
  <div v-else class="col-sm-4"><label for="mod-state" class="form-label">Comment state</label><AppSelect id="mod-state" v-model="state" :options="STATE_OPTIONS" class="form-select" :disabled="pending" @change="load(false)" /></div>
  <div class="col-sm-6"><label for="mod-deal" class="form-label">Deal ID (optional)</label><input id="mod-deal" v-model="dealId" name="dealId" class="form-control" pattern="[a-f0-9]{24}" spellcheck="false" autocomplete="off" autocapitalize="none" translate="no" :disabled="pending" /></div>
  <div class="col-sm-2 align-self-end"><button type="submit" class="btn btn-outline-primary" :disabled="pending||loading">Apply filters</button></div>
 </form>
 <p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
 <div class="row g-4">
 <section class="col-lg-5" aria-label="Moderation queue" :aria-busy="loading">
 <h2 class="h4">{{mode==='REPORTS'?'Report queue':'Comment queue'}}</h2>
 <TicketLoading v-if="loading" label="Loading queue…" />
 <p v-else-if="!(mode==='REPORTS'?reports.length:comments.length)" role="status">No records match these filters.</p>
 <ul class="list-group">
 <template v-if="mode==='REPORTS'"><li v-for="r in reports" :key="r.id" class="list-group-item"><strong>{{r.reason}} · {{r.status}}</strong><p class="text-break small">{{r.deal?.title??'Target unavailable'}} · <span translate="no">{{r.id}}</span></p><button type="button" class="btn btn-outline-primary btn-sm" data-testid="inspect-report" :disabled="pending" @click="inspect(r)">Inspect report<span class="visually-hidden">: {{r.reason}}, {{r.deal?.title??'target unavailable'}}</span></button></li></template>
 <template v-else><li v-for="c in comments" :key="c.id" class="list-group-item"><p class="evidence-text">{{c.body}}</p><span>{{c.state}}</span> <button type="button" class="btn btn-outline-primary btn-sm" data-testid="inspect-comment" :disabled="pending" @click="inspect(c)">Inspect comment<span class="visually-hidden">: {{c.body.slice(0, 60)}}</span></button></li></template>
 </ul><button v-if="nextCursor" type="button" class="btn btn-outline-primary mt-3" :disabled="loading||pending" @click="load(true)">Load more</button>
 </section>
 <section class="col-lg-7" aria-label="Selected evidence" :aria-busy="detailLoading">
 <h2 class="h4">Investigation</h2><TicketLoading v-if="detailLoading" label="Loading selected evidence…" />
 <template v-else-if="selected">
 <p class="small text-break"><span translate="no">{{selected.id}}</span> · moderation version {{selected.moderationVersion}}</p>
 <button type="button" class="btn btn-outline-primary btn-sm mb-3" data-testid="refresh-detail" :disabled="pending" @click="inspect(selected)">Refresh selected evidence</button>
 <template v-if="report"><h3 class="h5">{{report.reason}} · {{report.status}}</h3><p>Reporter (staff only): {{report.reporter?.name??'Unavailable'}} <span class="small text-break">{{report.reporter?.id}}</span></p><p class="evidence-text">{{report.details??'No additional evidence supplied.'}}</p><p v-if="report.resolution">Recorded resolution: {{report.resolution}}</p><p v-if="report.comment" class="evidence-text">Target comment: {{report.comment.body}} · {{report.comment.state}}</p></template>
 <template v-if="comment"><p class="evidence-text">{{comment.body}}</p><p>Author: {{comment.author?.name??'Unavailable'}} · {{comment.state}}</p><p v-if="comment.deletedAt">Author deleted this comment. It cannot be restored.</p></template>
 <div v-if="selected.deal" class="mb-3"><h3 class="h5">{{selected.deal.title}}</h3><dl><dt>Deal review</dt><dd>{{selected.deal.reviewStatus}} · content {{selected.deal.contentVersion}} / reviewed {{selected.deal.reviewedVersion??'none'}}</dd><dt>Published at</dt><dd><time v-if="selected.deal.publishedAt" :datetime="selected.deal.publishedAt">{{formatDateTime(selected.deal.publishedAt)}}</time><template v-else>Unpublished</template></dd><dt>Deleted at</dt><dd><time v-if="selected.deal.deletedAt" :datetime="selected.deal.deletedAt">{{formatDateTime(selected.deal.deletedAt)}}</time><template v-else>Not deleted</template></dd><dt>Scope</dt><dd>{{selected.deal.applicability}}</dd></dl></div>
 <p v-else>Deal context is unavailable. Report evidence remains investigable.</p>
 <p v-if="lockMessage" role="alert">{{lockMessage}}</p>
 <form data-testid="decision-form" @submit.prevent="submit">
 <fieldset :disabled="pending||!!(report&&report.status!=='OPEN')||!!comment?.deletedAt">
 <legend class="h5">{{report?'Report decision':comment?.hiddenAt?'Restore comment':'Hide comment'}}</legend>
 <div v-if="report" class="mb-3"><label for="mod-decision" class="form-label">Decision</label><AppSelect id="mod-decision" v-model="decision" :options="DECISION_OPTIONS" class="form-select" @change="resetConsent" /></div>
 <label for="mod-note" class="form-label">{{report?'Resolution':'Moderation note'}} (required)</label><textarea id="mod-note" v-model="note" name="note" class="form-control mb-3" rows="3" maxlength="500" required />
 <div class="form-check mb-3"><input id="mod-confirm" v-model="confirmed" name="confirmed" class="form-check-input" type="checkbox" /><label for="mod-confirm" class="form-check-label">I reviewed this exact target and version, and confirm this action.</label></div>
 <button type="submit" class="btn btn-primary" :disabled="blocked">{{pending?'Saving…':report?'Record report decision':comment?.hiddenAt?'Restore comment':'Hide comment'}}</button>
 </fieldset></form>
 </template><p v-else>Select a record to inspect its current evidence before acting.</p>
 </section></div>
</section>
</template>
<style scoped>
.scope-note{border-inline-start:3px solid var(--bs-primary);padding-inline-start:1rem}.evidence-text{white-space:pre-wrap;overflow-wrap:anywhere}.moderation-panel{overflow-wrap:anywhere}.list-group-item{background:transparent;min-width:0}.moderation-panel dd{margin-block-end:.75rem}
</style>
