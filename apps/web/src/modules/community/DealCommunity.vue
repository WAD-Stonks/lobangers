<script setup lang="ts">
import { api } from '@web/lib/api-client'
import CommentBody from '@web/modules/community/CommentBody.vue'
import { useDealCommunity } from '@web/modules/community/use-deal-community'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, nextTick, ref, toRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const props = withDefaults(defineProps<{ dealId: string; allComments?: boolean }>(), { allComments: false })
const emit = defineEmits<{ updated: []; 'view-change': [open: boolean] }>()
const state = useDealCommunity(toRef(props, 'dealId'), () => emit('updated'), toRef(props, 'allComments'))
const { session, summary, comments, cursor, loading, refreshing, loadingMore, busy, error, draft, receipt } = state
const route = useRoute()
const login = computed(() => ({ path: '/login', query: { redirect: route.fullPath } }))
const labels = { LIKELY_STILL_ON: 'Likely still on', UNCERTAIN: 'Availability uncertain', EXPIRED: 'Promotion has ended', NO_RECENT_REPORTS: 'No recent reports' }
const removeId = ref<string | null>(null)
const report = ref<{ kind: 'deal' | 'comment'; id: string } | null>(null)
const reason = ref<'SPAM' | 'MISLEADING' | 'INAPPROPRIATE' | 'OTHER'>('INAPPROPRIATE')
const details = ref('')
const reasonInput = ref<HTMLSelectElement | null>(null)
const commentInput = ref<HTMLTextAreaElement | null>(null)
const pending = ref<'vote' | 'comment' | 'delete' | 'report' | null>(null)
const root = ref<HTMLElement | null>(null)
const commentsHeading = ref<HTMLElement | null>(null)
const viewAllButton = ref<HTMLButtonElement | null>(null)
const shownComments = computed(() => props.allComments ? comments.value : comments.value.slice(0, 3))
const hasMoreComments = computed(() => cursor.value || comments.value.length > 3 || (summary.value?.commentCount ?? 0) > 3)
let previewScrollTop = 0
const openComments = () => {
  previewScrollTop = root.value?.closest<HTMLElement>('[data-testid="panel-body"]')?.scrollTop ?? 0
  emit('view-change', true)
}
watch(() => props.allComments, async (open) => {
  const panel = root.value?.closest<HTMLElement>('[data-testid="panel-body"]')
  report.value = null
  removeId.value = null
  await nextTick()
  if (open) {
    commentsHeading.value?.focus({ preventScroll: true })
    if (panel) panel.scrollTop = 0
  } else {
    if (panel) panel.scrollTop = previewScrollTop
    viewAllButton.value?.focus({ preventScroll: true })
  }
})
let reportTrigger: HTMLElement | null = null
let deleteArticle: HTMLElement | null = null
const openDelete = async (id: string, event: Event) => {
  deleteArticle = event.currentTarget instanceof HTMLElement ? event.currentTarget.closest('article') : null
  removeId.value = id
  await nextTick()
  deleteArticle?.querySelector<HTMLButtonElement>('.deal-community-delete-confirm button')?.focus()
}
const cancelDelete = async () => {
  removeId.value = null
  await nextTick()
  deleteArticle?.querySelector<HTMLButtonElement>('.deal-community-text-button')?.focus()
}
const openReport = async (kind: 'deal' | 'comment', id: string, event: Event) => {
  reportTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  report.value = { kind, id }
  reason.value = 'INAPPROPRIATE'
  details.value = ''
  await nextTick()
  reasonInput.value?.focus()
}
const closeReport = async () => {
  report.value = null
  await nextTick()
  reportTrigger?.focus()
}
const sendReport = async () => {
  const target = report.value
  if (!target || busy.value) return
  pending.value = 'report'
  const input = { reason: reason.value, details: details.value.trim() }
  const success = await state.mutate(
    () => target.kind === 'deal' ? api.community.reportDeal(target.id, input) : api.community.reportComment(target.id, input),
    'Report received for review. Reports do not automatically hide content.',
  )
  pending.value = null
  if (success) await closeReport()
}
const remove = async (id: string) => {
  if (busy.value) return
  pending.value = 'delete'
  if (await state.mutate(() => api.community.deleteComment(id), 'Comment deleted.')) {
    removeId.value = null
    await nextTick()
    commentInput.value?.focus()
  }
  pending.value = null
}
const vote = async (value: 'ALIVE' | 'DEAD') => {
  if (busy.value) return
  pending.value = 'vote'
  await state.vote(value)
  pending.value = null
}
const post = async () => {
  if (busy.value) return
  pending.value = 'comment'
  await state.post()
  pending.value = null
}
watch([() => props.dealId, () => session.value.data?.user.id], () => { report.value = null; removeId.value = null; pending.value = null; reportTrigger = null })
const date = (value: string) => new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' }).format(new Date(value))
const initials = (name: string) => Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?'
</script>

<template>
  <section ref="root" class="deal-community" :class="{ 'deal-community--all': allComments }" :aria-labelledby="allComments ? 'deal-community-comments-title' : 'deal-community-title'" data-testid="deal-community">
    <header v-if="!allComments" class="deal-community-header">
      <h2 id="deal-community-title">Community verification</h2>
      <button type="button" class="deal-community-text-button" :disabled="loading || refreshing || busy || loadingMore" @click="state.refresh"><ShellIcon name="refresh" :size="16" />{{ refreshing ? 'Refreshing…' : 'Refresh' }}</button>
    </header>
    <p v-if="loading" class="deal-community-loading" role="status">Loading community updates…</p>
    <div v-if="error" class="deal-community-notice deal-community-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="deal-community-text-button" :disabled="busy" @click="state.refresh">Refresh updates</button>
    </div>
    <p v-if="receipt" class="deal-community-notice" role="status"><ShellIcon name="check" :size="18" />{{ receipt }}</p>
    <div v-if="summary && !allComments" class="deal-community-verification">
      <div class="deal-community-status-row">
        <p class="deal-community-status" :class="`deal-community-status--${summary.status.toLowerCase()}`">
          <ShellIcon :name="summary.status === 'LIKELY_STILL_ON' ? 'check' : summary.status === 'EXPIRED' ? 'close' : 'minus'" :size="16" />
          {{ labels[summary.status] }}
        </p>
        <span class="deal-community-period">Last {{ summary.policy.windowHours }} hours</span>
      </div>
      <p class="deal-community-meta">{{ summary.alive }} still on · {{ summary.dead }} gone</p>
      <p v-if="summary.lastReportedAt" class="deal-community-meta">Last update <time :datetime="summary.lastReportedAt">{{ date(summary.lastReportedAt) }} SGT</time></p>
      <template v-if="session.data">
        <fieldset class="deal-community-vote-group" :disabled="busy || summary.status === 'EXPIRED'" aria-describedby="deal-community-vote-help">
          <legend>Is this deal still available?</legend>
          <div class="deal-community-votes">
            <button type="button" class="deal-community-vote deal-community-vote--alive" :disabled="busy || summary.status === 'EXPIRED'" :aria-pressed="summary.myVote === 'ALIVE' && summary.myVoteIsRecent" data-testid="vote-alive" @click="vote('ALIVE')"><ShellIcon name="check" :size="20" /><span>Still on</span><span class="deal-community-vote-count">{{ summary.alive }}</span></button>
            <button type="button" class="deal-community-vote" :disabled="busy || summary.status === 'EXPIRED'" :aria-pressed="summary.myVote === 'DEAD' && summary.myVoteIsRecent" data-testid="vote-dead" @click="vote('DEAD')"><ShellIcon name="close" :size="20" /><span>Gone</span><span class="deal-community-vote-count">{{ summary.dead }}</span></button>
          </div>
        </fieldset>
        <p id="deal-community-vote-help" class="deal-community-help">
          <template v-if="summary.status === 'EXPIRED'">Voting is closed because this promotion has ended.</template>
          <template v-else-if="summary.myVote && summary.myVoteIsRecent">Your vote: {{ summary.myVote === 'ALIVE' ? 'Still on' : 'Gone' }}. Select it again to remove it.</template>
          <template v-else-if="summary.myVote">Your previous vote is no longer current. Vote again after your next visit.</template>
          <template v-else>Visited recently? Share what you found.</template>
        </p>
        <p v-if="pending === 'vote'" class="deal-community-help" role="status">Updating your vote…</p>
      </template>
      <RouterLink v-else class="lb-btn deal-community-login" :to="login">Log in to verify this deal</RouterLink>
      <details class="deal-community-explanation">
        <summary>How verification works</summary>
        <p>{{ summary.policy.minAlive }} positive voters and at least {{ summary.policy.positivePercent }}% positive votes in the last {{ summary.policy.windowHours }} hours are needed for “Likely still on”. Expired deals never qualify. This is community evidence, not a guarantee.</p>
        <p>Votes cover this promotion across all outlets. Availability can vary; mention the outlet you visited in your comment.</p>
      </details>
      <button v-if="session.data" type="button" class="deal-community-text-button deal-community-report-link" :disabled="busy" @click="openReport('deal', dealId, $event)">Report this deal</button>
    </div>
    <form v-if="report" class="deal-community-report" aria-labelledby="deal-community-report-title" @submit.prevent="sendReport" @keydown.esc.prevent.stop="!busy && closeReport()">
      <h3 id="deal-community-report-title">Report {{ report.kind === 'deal' ? 'this deal' : 'this comment' }}</h3>
      <p class="deal-community-help">For spam or inappropriate content. Use “Gone” to report availability.</p>
      <label for="deal-community-reason">Reason</label>
      <select id="deal-community-reason" ref="reasonInput" v-model="reason" :disabled="busy"><option value="INAPPROPRIATE">Inappropriate content</option><option value="SPAM">Spam</option><option value="MISLEADING">Misleading information</option><option value="OTHER">Other</option></select>
      <label for="deal-community-report-details">Details (optional)</label>
      <textarea id="deal-community-report-details" v-model="details" maxlength="500" rows="3" :disabled="busy" />
      <div class="deal-community-actions deal-community-actions--end"><button class="lb-btn" type="button" :disabled="busy" @click="closeReport">Cancel</button><button class="lb-btn lb-btn--primary" type="submit" :disabled="busy">{{ pending === 'report' ? 'Sending…' : 'Send report' }}</button></div>
    </form>
    <section class="deal-community-discussion" aria-labelledby="deal-community-comments-title">
      <header class="deal-community-header">
        <h2 id="deal-community-comments-title" ref="commentsHeading" tabindex="-1">Comments <span v-if="summary" class="deal-community-comment-total">{{ summary.commentCount }}</span></h2>
        <span v-if="comments.length" class="deal-community-help">Newest first</span>
      </header>
      <button v-if="allComments" type="button" class="deal-community-text-button deal-community-refresh" :disabled="refreshing || busy || loadingMore" @click="state.refresh">{{ refreshing ? 'Refreshing…' : 'Refresh comments' }}</button>
      <p class="deal-community-help">Share outlet details, redemption tips, or your experience.</p>
      <form v-if="session.data && summary" class="deal-community-comment-form" @submit.prevent="post">
        <label for="deal-community-comment">Share your experience</label>
        <textarea id="deal-community-comment" ref="commentInput" v-model="draft" maxlength="2000" rows="3" required :disabled="busy" aria-describedby="deal-community-comment-help deal-community-comment-count" placeholder="Which outlet did you visit? Were there any conditions?" />
        <p id="deal-community-comment-help" class="deal-community-help">Keep it helpful and respectful. Avoid sharing personal information.</p>
        <div class="deal-community-actions"><small id="deal-community-comment-count" class="deal-community-help">{{ draft.length.toLocaleString() }} / 2,000</small><button type="submit" class="lb-btn lb-btn--primary deal-community-post" :disabled="busy || !draft.trim()">{{ pending === 'comment' ? 'Posting…' : 'Post comment' }}</button></div>
      </form>
      <div v-else-if="summary" class="deal-community-sign-in"><RouterLink :to="login">Log in to join the conversation</RouterLink><span class="deal-community-help">You can read comments without an account.</span></div>
      <div v-if="summary && !loading && !comments.length" class="deal-community-empty"><strong>No comments yet</strong><p>Be the first to share a tip from your visit.</p></div>
      <ol class="deal-community-comments" aria-label="Comments, newest first">
        <li v-for="comment in shownComments" :key="comment.id">
          <article>
            <div class="deal-community-comment-heading">
              <span class="deal-community-avatar" aria-hidden="true">{{ initials(comment.authorName) }}</span>
              <div class="deal-community-author"><div><strong>{{ comment.authorName }}</strong><span v-if="comment.canDelete" class="deal-community-you">You</span></div><time :datetime="comment.createdAt">{{ date(comment.createdAt) }} SGT</time></div>
            </div>
            <CommentBody :body="comment.body" />
            <div v-if="session.data" class="deal-community-comment-actions">
              <fieldset v-if="removeId === comment.id" class="deal-community-delete-confirm" aria-label="Confirm comment deletion"><p>Delete your comment? This cannot be undone.</p><div class="deal-community-actions deal-community-actions--end"><button class="lb-btn" type="button" :disabled="busy" @click="cancelDelete">Cancel</button><button class="lb-btn deal-community-danger" type="button" :disabled="busy" @click="remove(comment.id)">{{ pending === 'delete' ? 'Deleting…' : 'Confirm delete' }}</button></div></fieldset>
              <button v-else-if="comment.canDelete" class="deal-community-text-button" type="button" :disabled="busy" @click="openDelete(comment.id, $event)">Delete comment</button>
              <button v-if="!comment.canDelete" class="deal-community-text-button" type="button" :disabled="busy" @click="openReport('comment', comment.id, $event)">Report comment</button>
            </div>
          </article>
        </li>
      </ol>
      <button v-if="!allComments && hasMoreComments" ref="viewAllButton" class="lb-btn lb-btn--block" type="button" :disabled="busy || refreshing || loadingMore" @click="openComments">View all comments<span v-if="summary"> ({{ summary.commentCount }})</span><ShellIcon name="chevronRight" :size="16" /></button>
      <button v-else-if="allComments && cursor" class="lb-btn lb-btn--block" type="button" :disabled="loadingMore || refreshing || busy" @click="state.more">{{ loadingMore ? 'Loading…' : 'Load 5 more comments' }}</button>
    </section>
  </section>
</template>

<style scoped>
.deal-community { display: grid; gap: 16px; min-width: 0; padding-block: 24px; border-top: 1px solid var(--hairline); color: var(--ink); }
.deal-community--all { border-top: 0; padding-block: 0; }
.deal-community-refresh { justify-self: start; }
.deal-community-discussion h2:focus-visible { outline: 3px solid var(--coral-deep); outline-offset: 3px; border-radius: 4px; }
.deal-community-header, .deal-community-actions, .deal-community-status-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; justify-content: space-between; }
.deal-community-header h2 { font: 700 1rem/1.4 var(--font-sans); margin: 0; }
.deal-community-verification { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--hairline); border-radius: 16px; background: var(--paper-white); min-width: 0; }
.deal-community-status { display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 5px 9px; border-radius: 8px; background: var(--paper-sunk); font-size: 0.8125rem; font-weight: 700; line-height: 1.5; }
.deal-community-status--likely_still_on { color: var(--tag-ok-ink); background: var(--tag-ok-bg); }
.deal-community-status--expired { color: var(--tag-end-ink); background: var(--tag-end-bg); }
.deal-community-period, .deal-community-meta, .deal-community-help, .deal-community-author time { font-size: 0.8125rem; color: var(--ink-muted); line-height: 1.6; margin: 0; }
.deal-community-vote-group { min-width: 0; margin: 8px 0 0; padding: 0; border: 0; }
.deal-community-vote-group legend { float: none; width: auto; margin: 0 0 10px; font: 700 0.875rem/1.5 var(--font-sans); }
.deal-community-votes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.deal-community-vote { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 7px; min-height: 48px; padding: 10px 8px; border: 1px solid var(--hairline-strong); border-radius: 12px; background: var(--paper-white); color: var(--ink); font: 700 0.875rem/1.4 var(--font-sans); cursor: pointer; }
.deal-community-vote:hover { background: var(--paper-hover); }
.deal-community-vote[aria-pressed="true"] { background: var(--coral-soft); border-color: var(--coral-deep); box-shadow: inset 0 0 0 1px var(--coral-deep); color: var(--coral-deep); }
.deal-community-vote--alive[aria-pressed="true"] { background: var(--tag-ok-bg); border-color: var(--tag-ok-ink); box-shadow: inset 0 0 0 1px var(--tag-ok-ink); color: var(--tag-ok-ink); }
.deal-community-vote-count { font-variant-numeric: tabular-nums; font-weight: 500; }
.deal-community-vote:disabled { cursor: not-allowed; opacity: 0.65; }
.deal-community-explanation { border-top: 1px solid var(--hairline); padding-top: 6px; }
.deal-community-explanation summary { min-height: 44px; align-content: center; cursor: pointer; font-size: 0.8125rem; font-weight: 600; }
.deal-community-explanation p { margin: 4px 0 10px; color: var(--ink-muted); font-size: 0.8125rem; line-height: 1.6; }
.deal-community-text-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 6px; background: transparent; color: var(--ink-muted); min-height: 44px; padding: 8px; font: 600 0.8125rem/1.5 var(--font-sans); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.deal-community-text-button:hover { color: var(--ink); background: var(--paper-hover); }
.deal-community-text-button:disabled { cursor: not-allowed; opacity: 0.6; }
.deal-community-report-link { justify-self: start; margin-top: -6px; }
.deal-community-login { white-space: normal; text-align: center; }
.deal-community-discussion { display: grid; gap: 14px; padding-top: 8px; min-width: 0; }
.deal-community-comment-total { display: inline-grid; place-items: center; min-width: 24px; min-height: 24px; padding: 0 6px; border-radius: 8px; background: var(--paper-sunk); color: var(--ink-muted); font: 600 0.75rem/1 var(--font-sans); vertical-align: middle; }
.deal-community-comment-form, .deal-community-report { display: grid; gap: 8px; min-width: 0; }
.deal-community label { font-size: 0.875rem; font-weight: 600; }
.deal-community textarea, .deal-community select { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--hairline-strong); border-radius: 12px; padding: 12px; background: var(--paper-white); color: var(--ink); font: 400 1rem/1.5 var(--font-sans); }
.deal-community textarea { resize: vertical; }
.deal-community textarea::placeholder { color: var(--ink-muted); }
.deal-community-actions--end { justify-content: flex-end; }
.deal-community-sign-in { display: grid; gap: 4px; padding: 14px; border: 1px solid var(--hairline); border-radius: 12px; font-size: 0.875rem; }
.deal-community-sign-in a { display: inline-flex; align-items: center; min-height: 44px; color: var(--coral-deep); font-weight: 600; }
.deal-community-empty { text-align: center; padding: 24px 12px; border-radius: 12px; background: var(--paper-sunk); font-size: 0.875rem; }
.deal-community-empty p { margin: 6px 0 0; color: var(--ink-muted); line-height: 1.6; }
.deal-community-comments { display: grid; list-style: none; margin: 0; padding: 0; }
.deal-community-comments > li { padding-block: 18px; border-bottom: 1px solid var(--hairline); min-width: 0; }
.deal-community-comment-heading { display: flex; align-items: start; gap: 10px; }
.deal-community-avatar { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 50%; background: var(--coral-soft); color: var(--coral-deep); font-size: 0.875rem; font-weight: 700; }
.deal-community-author { display: grid; gap: 2px; min-width: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
.deal-community-you { margin-left: 8px; font-size: 0.75rem; color: var(--ink-muted); }
.deal-community-comment-actions { display: flex; justify-content: flex-end; }
.deal-community-delete-confirm, .deal-community-report { padding: 14px; border: 1px solid var(--hairline); border-radius: 12px; background: var(--paper-sunk); }
.deal-community-delete-confirm { width: 100%; font-size: 0.875rem; }
.deal-community-delete-confirm p { line-height: 1.6; margin: 0 0 10px; }
.deal-community-danger { color: var(--coral-deep); border-color: var(--coral-deep); }
.deal-community-report h3 { font: 700 0.9375rem/1.5 var(--font-sans); margin: 0; }
.deal-community-notice { display: flex; align-items: start; gap: 8px; margin: 0; padding: 12px; border-radius: 12px; color: var(--tag-ok-ink); background: var(--tag-ok-bg); font-size: 0.8125rem; line-height: 1.6; overflow-wrap: anywhere; }
.deal-community-notice p { margin: 0; }
.deal-community-error { flex-direction: column; color: var(--ink); background: var(--paper-sunk); border: 1px solid var(--hairline-strong); }
.deal-community-loading { margin: 0; font-size: 0.875rem; color: var(--ink-muted); }
.deal-community :is(button, a, summary, textarea, select):focus-visible { outline: 3px solid var(--coral-deep); outline-offset: 3px; }
.deal-community .lb-btn { min-height: 44px; }
.deal-community-post:disabled { cursor: default; background: var(--sunny); color: var(--ink); transform: none; transition: none; animation: none; box-shadow: none; }
</style>
