<script setup lang="ts">
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminWorkspace from '@web/components/admin/AdminWorkspace.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { formatDateTime } from '@web/lib/format'
import { useModeration } from '@web/modules/admin-moderation/use-moderation'
import { computed, nextTick, ref, watch } from 'vue'

const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const {
  mode, targetType, status, state, reason, dealId, reports, comments, report, comment,
  nextCursor, loading, detailLoading, pending, error, notice, note, confirmed,
  decision, selected, blocked, lockMessage, load, inspect, submit, resetConsent, clearSelection,
} = useModeration((code) => emit('denied', code))
const heading = ref<HTMLElement | null>(null)
const returnFocus = ref<HTMLElement | null>(null)
const hasDetail = computed(() => Boolean(selected.value || detailLoading.value))
const queueCount = computed(() => mode.value === 'REPORTS' ? reports.value.length : comments.value.length)
const displayLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase()
watch(() => selected.value?.id, async (id) => {
  if (!id) return
  await nextTick()
  heading.value?.focus()
})
const inspectRecord = (row: Parameters<typeof inspect>[0], event: MouseEvent) => {
  if (pending.value) return
  returnFocus.value = event.currentTarget as HTMLElement
  void inspect(row)
}
const closeDetail = async () => {
  if (pending.value) return
  clearSelection()
  await nextTick()
  returnFocus.value?.focus()
}
</script>

<template>
  <section class="moderation-panel" aria-label="Reports and comment moderation">
    <p class="moderation-introduction">Review reported deals and comments, inspect the evidence, then record a decision.</p>
    <form class="row moderation-filters" @submit.prevent="load(false)">
      <div><label for="mod-queue" class="form-label">Queue</label><select id="mod-queue" v-model="mode" class="form-select" :disabled="pending" @change="load(false)"><option value="REPORTS">Reports</option><option value="COMMENTS">Comments</option></select></div>
      <template v-if="mode === 'REPORTS'">
        <div><label for="mod-type" class="form-label">Report collection</label><select id="mod-type" v-model="targetType" class="form-select" :disabled="pending" @change="load(false)"><option value="COMMENT">Comment reports</option><option value="DEAL">Deal reports</option></select></div>
        <div><label for="mod-status" class="form-label">Report status</label><select id="mod-status" v-model="status" class="form-select" :disabled="pending" @change="load(false)"><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></select></div>
        <div><label for="mod-reason" class="form-label">Reason</label><select id="mod-reason" v-model="reason" class="form-select" :disabled="pending"><option value="">All reasons</option><option value="SPAM">Spam</option><option value="MISLEADING">Misleading</option><option value="INAPPROPRIATE">Inappropriate</option><option value="OTHER">Other</option></select></div>
      </template>
      <div v-else><label for="mod-state" class="form-label">Comment state</label><select id="mod-state" v-model="state" class="form-select" :disabled="pending" @change="load(false)"><option value="VISIBLE">Visible</option><option value="HIDDEN">Hidden</option><option value="AUTHOR_DELETED">Deleted by author</option></select></div>
      <button type="submit" class="btn btn-outline-primary" :disabled="pending || loading">Apply filters</button>
      <details class="moderation-advanced"><summary>Advanced filters</summary><label for="mod-deal" class="form-label">Deal ID (optional)</label><input id="mod-deal" v-model="dealId" name="dealId" class="form-control" pattern="[a-f0-9]{24}" spellcheck="false" autocomplete="off" autocapitalize="none" translate="no" :disabled="pending" /></details>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status" class="moderation-notice">{{ notice }}</p>
    <AdminWorkspace :selected="hasDetail" :disabled="pending" label="Moderation queue" detail-label="Selected evidence" @close="closeDetail">
      <template #list>
        <header class="moderation-list-heading"><h2>{{ mode === 'REPORTS' ? 'Report queue' : 'Comment queue' }}</h2><span v-if="!loading">{{ queueCount }} loaded</span></header>
        <TicketLoading v-if="loading" label="Loading queue…" />
        <div v-else-if="!queueCount" class="moderation-empty" role="status"><h3>Queue clear</h3><p>No records match these filters.</p></div>
        <ul class="moderation-records">
          <template v-if="mode === 'REPORTS'">
            <li v-for="r in reports" :key="r.id" :class="{ 'is-selected': report?.id === r.id }">
              <div class="moderation-record-meta"><span class="moderation-reason">{{ displayLabel(r.reason) }}</span><AdminStatusBadge :status="r.status" :tone="r.status === 'OPEN' ? 'warning' : r.status === 'RESOLVED' ? 'success' : 'neutral'" /></div>
              <strong>{{ r.deal?.title ?? (r.targetType === 'COMMENT' ? 'Reported comment' : 'Target unavailable') }}</strong>
              <p v-if="r.details" class="moderation-excerpt">{{ r.details }}</p>
              <button type="button" class="btn btn-outline-primary btn-sm" data-testid="inspect-report" :aria-current="report?.id === r.id ? 'true' : undefined" :disabled="pending" @click="inspectRecord(r, $event)">Inspect report<span class="visually-hidden">: {{ displayLabel(r.reason) }}, {{ r.deal?.title ?? 'target unavailable' }}</span></button>
            </li>
          </template>
          <template v-else>
            <li v-for="c in comments" :key="c.id" :class="{ 'is-selected': comment?.id === c.id }"><AdminStatusBadge :status="c.state" /><p class="moderation-excerpt">{{ c.body }}</p><button type="button" class="btn btn-outline-primary btn-sm" data-testid="inspect-comment" :aria-current="comment?.id === c.id ? 'true' : undefined" :disabled="pending" @click="inspectRecord(c, $event)">Inspect comment<span class="visually-hidden">: {{ c.body.slice(0, 60) }}</span></button></li>
          </template>
        </ul>
        <div v-if="nextCursor" class="moderation-pagination"><button type="button" class="btn btn-outline-primary" :disabled="loading || pending" @click="load(true)">Load more</button></div>
      </template>
      <template #detail>
        <TicketLoading v-if="detailLoading" label="Loading selected evidence…" />
        <template v-else-if="selected">
          <header class="moderation-detail-heading"><div><p class="moderation-eyebrow">{{ report ? 'Report investigation' : 'Comment investigation' }}</p><h2 ref="heading" tabindex="-1" data-testid="moderation-detail-heading">{{ report ? `${displayLabel(report.reason)} report` : 'Review comment' }}</h2></div><AdminStatusBadge :status="report?.status ?? comment?.state ?? ''" :tone="report?.status === 'OPEN' ? 'warning' : undefined" /></header>
          <button type="button" class="btn btn-outline-primary btn-sm" data-testid="refresh-detail" :disabled="pending" @click="inspect(selected)">Refresh selected evidence</button>
          <section class="moderation-evidence" aria-label="Evidence">
            <template v-if="report"><h3>Reported evidence</h3><p class="moderation-byline">Reported by {{ report.reporter?.name ?? 'Unavailable' }} <span>(staff only)</span></p><p class="evidence-text">{{ report.details ?? 'No additional evidence supplied.' }}</p><p v-if="report.resolution">Recorded resolution: {{ report.resolution }}</p><blockquote v-if="report.comment"><p class="evidence-text">{{ report.comment.body }}</p><AdminStatusBadge :status="report.comment.state" /></blockquote></template>
            <template v-if="comment"><h3>Comment</h3><p class="evidence-text">{{ comment.body }}</p><p class="moderation-byline">Author: {{ comment.author?.name ?? 'Unavailable' }}</p><p v-if="comment.deletedAt" class="moderation-consequence">Author deleted this comment. It cannot be restored.</p></template>
          </section>
          <section v-if="selected.deal" class="moderation-context" aria-label="Deal context"><h3>{{ selected.deal.title }}</h3><dl><dt>Review</dt><dd><AdminStatusBadge :status="selected.deal.reviewStatus" /></dd><dt>Publication</dt><dd><time v-if="selected.deal.publishedAt" :datetime="selected.deal.publishedAt">{{ formatDateTime(selected.deal.publishedAt) }}</time><template v-else>Unpublished</template></dd><dt>Scope</dt><dd class="moderation-scope">{{ displayLabel(selected.deal.applicability) }}</dd><template v-if="selected.deal.deletedAt"><dt>Deleted</dt><dd><time :datetime="selected.deal.deletedAt">{{ formatDateTime(selected.deal.deletedAt) }}</time></dd></template></dl></section>
          <p v-else class="moderation-context-note">Deal context is unavailable. Report evidence remains investigable.</p>
          <details class="moderation-record-details"><summary>Record details</summary><dl><dt>Record ID</dt><dd translate="no">{{ selected.id }}</dd><dt>Moderation version</dt><dd>{{ selected.moderationVersion }}</dd><template v-if="report?.reporter"><dt>Reporter ID</dt><dd translate="no">{{ report.reporter.id }}</dd></template><template v-if="selected.deal"><dt>Content version</dt><dd>{{ selected.deal.contentVersion }} / reviewed {{ selected.deal.reviewedVersion ?? 'none' }}</dd></template></dl></details>
          <p v-if="lockMessage" role="alert">{{ lockMessage }}</p>
          <form data-testid="decision-form" class="moderation-decision" @submit.prevent="submit">
            <fieldset :disabled="pending || !!(report && report.status !== 'OPEN') || !!comment?.deletedAt">
              <legend>{{ report ? 'Report decision' : comment?.hiddenAt ? 'Restore comment' : 'Hide comment' }}</legend>
              <p class="moderation-consequence">{{ report ? 'This decision updates this report only. It does not hide the deal or comment, or resolve other reports.' : comment?.hiddenAt ? 'Restore the visibility of this comment only. Reports and votes will not change.' : 'Hide this comment only. Reports and votes will not change.' }}</p>
              <div v-if="report" class="mb-3"><label for="mod-decision" class="form-label">Decision</label><select id="mod-decision" v-model="decision" class="form-select" @change="resetConsent"><option value="RESOLVED">Resolve report only</option><option value="DISMISSED">Dismiss report only</option></select></div>
              <label for="mod-note" class="form-label">{{ report ? 'Resolution' : 'Moderation note' }} (required)</label><textarea id="mod-note" v-model="note" name="note" class="form-control mb-3" rows="3" maxlength="500" required />
              <div class="form-check mb-3"><input id="mod-confirm" v-model="confirmed" name="confirmed" class="form-check-input" type="checkbox" /><label for="mod-confirm" class="form-check-label">I reviewed this exact target and version, and confirm this action.</label></div>
              <button type="submit" class="btn" :class="comment && !comment.hiddenAt ? 'btn-outline-danger' : 'btn-primary'" :disabled="blocked">{{ pending ? 'Saving…' : report ? 'Record report decision' : comment?.hiddenAt ? 'Restore comment' : 'Hide comment' }}</button>
            </fieldset>
          </form>
          <details class="moderation-help"><summary>Need to change deal publication?</summary><p><a href="/admin/deals">Open global deal publication controls</a>. Unpublishing a deal affects the whole promotion across its chain/outlets; investigate scope explicitly. Never infer an outlet from a report.</p></details>
        </template>
        <div v-else class="moderation-empty"><h2>Select a record to investigate</h2><p>Select a record to inspect its current evidence before acting.</p><p>Reports concern a whole deal or an individual comment, not a verified outlet.</p></div>
      </template>
    </AdminWorkspace>
  </section>
</template>

<style scoped>
.moderation-panel { display: grid; gap: 20px; min-width: 0; }
.moderation-introduction { margin: 0; color: var(--admin-muted); }
.moderation-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 0; padding: 16px; border: 1px solid var(--admin-border); border-radius: 20px; background: var(--admin-surface); }
.moderation-filters > div { flex: 1 1 150px; min-width: 0; padding: 0; }
.moderation-filters > button { flex: 0 0 auto; width: auto; padding: 8px 16px; }
.moderation-advanced { flex: 1 1 100%; padding: 0; }
.moderation-advanced summary { color: var(--admin-muted); font-size: 13px; cursor: pointer; }
.moderation-advanced[open] .form-label { margin-top: 12px; }
.moderation-advanced .form-control { max-width: 400px; }
.moderation-notice { margin: 0; padding: 16px; border: 1px solid var(--admin-success-border); border-radius: 16px; color: var(--admin-success-ink); background: var(--admin-success-bg); }
.moderation-list-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 18px; border-bottom: 1px solid var(--admin-border); }
.moderation-list-heading h2 { margin: 0; }
.moderation-list-heading > span { color: var(--admin-muted); font-size: 12px; }
.moderation-records { list-style: none; padding: 0; margin: 0; }
.moderation-records li { display: grid; justify-items: start; gap: 12px; padding: 18px; border-bottom: 1px solid var(--admin-line); }
.moderation-records li.is-selected { background: var(--admin-selected-bg); box-shadow: inset 3px 0 var(--admin-accent); }
.moderation-record-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
.moderation-reason, .moderation-scope { text-transform: capitalize; }
.moderation-reason { color: var(--admin-muted); font-size: 13px; }
.moderation-excerpt { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin: 0; color: var(--admin-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.moderation-detail-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.moderation-detail-heading h2 { margin: 0; font-size: 23px; text-transform: capitalize; }
.moderation-detail-heading h2:focus { outline: none; }
.moderation-eyebrow { margin: 0 0 6px; color: var(--admin-muted); font-size: 12px; }
.moderation-evidence, .moderation-context { margin-top: 24px; }
.moderation-byline, .moderation-context-note { color: var(--admin-muted); font-size: 13px; }
.evidence-text { white-space: pre-wrap; overflow-wrap: anywhere; }
blockquote { padding: 16px; border-left: 3px solid var(--admin-border); background: var(--admin-subtle-bg); }
.moderation-context dl { display: grid; grid-template-columns: minmax(90px, .4fr) minmax(0, 1fr); gap: 10px 16px; }
.moderation-context dd { margin: 0; }
.moderation-record-details { margin: 20px 0; padding-block: 16px; border-block: 1px solid var(--admin-border); color: var(--admin-muted); font-size: 13px; }
.moderation-record-details dl { margin-top: 16px; overflow-wrap: anywhere; }
.moderation-decision { padding: 20px; border: 1px solid var(--admin-accent-border); border-radius: 16px; background: var(--admin-accent-wash); }
.moderation-decision fieldset { min-width: 0; }
.moderation-decision legend { float: none; font-size: 17px; font-weight: 650; }
.moderation-consequence { color: var(--admin-secondary-text); font-size: 13px; }
.moderation-help { margin-top: 20px; font-size: 13px; }
.moderation-help p { margin-top: 12px; }
.moderation-empty { padding: 36px 20px; color: var(--admin-muted); text-align: center; }
.moderation-empty h2, .moderation-empty h3 { color: var(--admin-text); }
.moderation-pagination { padding: 18px; }
@media (max-width: 575.98px) { .moderation-filters > div, .moderation-filters > button { flex-basis: 100%; } .moderation-context dl { grid-template-columns: 1fr; gap: 6px; } .moderation-context dd { margin-bottom: 10px; } .moderation-decision { padding: 16px; } }
</style>
