<script setup lang="ts">
import type { CommunityComment } from '@broke-oclock/contracts/community'
import { formatDateTime, formatRelativeTime } from '@web/lib/format'
import { useConfirm } from '@web/lib/use-confirm'
import CommentBody from '@web/modules/community/CommentBody.vue'
import { computed, nextTick, ref } from 'vue'
import { type RouteLocationRaw, RouterLink } from 'vue-router'

const props = defineProps<{
  comment: CommunityComment
  loggedIn: boolean
  busy: boolean
  login: RouteLocationRaw
  saveEdit: (body: string) => Promise<boolean>
  sendReply: (body: string) => Promise<boolean>
  toggleLike: () => Promise<unknown>
}>()
const emit = defineEmits<{ delete: [event: Event]; report: [event: Event] }>()
const menu = ref(false)
const editing = ref(false)
const replying = ref(false)
const editBody = ref('')
const replyBody = ref('')
const editor = ref<HTMLTextAreaElement | null>(null)
const replier = ref<HTMLTextAreaElement | null>(null)
const moreButton = ref<HTMLButtonElement | null>(null)
const replyButton = ref<HTMLButtonElement | null>(null)
const DISCARD_DRAFT = 'Discard what you have written?'
const age = computed(() => formatRelativeTime(props.comment.createdAt))
const postedAt = computed(() => formatDateTime(props.comment.createdAt))
const editDirty = computed(() => editBody.value.trim() !== props.comment.body.trim())
const replyDirty = computed(() => replyBody.value.trim().length > 0)
// Cancel asks before throwing a draft away, then hands focus back to what opened the form.
const { ask } = useConfirm()
const keepDraft = async (dirty: boolean) =>
  dirty &&
  !(await ask({ title: 'Discard draft?', body: DISCARD_DRAFT, confirmLabel: 'Discard', cancelLabel: 'Keep writing' }))
const cancelEdit = async () => {
  if (await keepDraft(editDirty.value)) return
  editing.value = false
  await nextTick()
  moreButton.value?.focus()
}
const cancelReply = async () => {
  if (await keepDraft(replyDirty.value)) return
  replying.value = false
  replyBody.value = ''
  await nextTick()
  replyButton.value?.focus()
}
const edit = async () => {
  menu.value = false
  editBody.value = props.comment.body
  editing.value = true
  await nextTick()
  editor.value?.focus()
}
const reply = async () => {
  if (replying.value) return cancelReply()
  replying.value = true
  await nextTick()
  replier.value?.focus()
}
const leaveMenu = (event: FocusEvent) => {
  if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
  menu.value = false
}
const save = async () => { if (await props.saveEdit(editBody.value.trim())) editing.value = false }
const postReply = async () => {
  if (await props.sendReply(replyBody.value.trim())) { replying.value = false; replyBody.value = '' }
}
</script>

<template>
  <article class="comment-card" :class="{ 'comment-card--reply': comment.parentId }">
    <span class="comment-card__avatar" aria-hidden="true">{{ Array.from(comment.authorName.trim())[0]?.toUpperCase() || '?' }}</span>
    <div class="comment-card__content">
      <header class="comment-card__heading">
        <strong class="comment-card__author">{{ comment.authorName }}</strong><span v-if="comment.canDelete" class="comment-card__you">You</span>
        <time :datetime="comment.createdAt" :title="postedAt">· {{ age }}<span v-if="comment.editedAt"> · Edited</span></time>
      </header>
      <p v-if="comment.parentId" class="comment-card__reply-to">Replying to {{ comment.replyToName || 'a comment' }}</p>
      <form v-if="editing" class="comment-card__form" @submit.prevent="save">
        <textarea ref="editor" v-model="editBody" name="body" aria-label="Edit comment" maxlength="2000" rows="3" required :disabled="busy" />
        <div><button class="lb-btn" type="button" :disabled="busy" @click="cancelEdit">Cancel</button><button class="lb-btn lb-btn--primary" type="submit" :disabled="busy || !editBody.trim()">Save changes</button></div>
      </form>
      <CommentBody v-else :body="comment.body" />
      <div class="comment-card__actions">
        <template v-if="loggedIn">
          <button type="button" :aria-pressed="Boolean(comment.liked)" :disabled="busy" @click="toggleLike"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H3V10h4Zm0 0 5-8c2 0 3 2 2 5l-1 3h6c2 0 2 2 2 3l-2 7c0 1-1 1-2 1H7" /></svg>{{ comment.liked ? 'Liked' : 'Like' }}<span v-if="comment.likeCount">{{ comment.likeCount }}</span></button>
          <button ref="replyButton" type="button" :aria-expanded="replying" :disabled="busy" @click="reply"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" /></svg>Reply</button>
        </template>
        <template v-else><RouterLink :to="login">Like<span v-if="comment.likeCount"> {{ comment.likeCount }}</span></RouterLink><RouterLink :to="login">Reply</RouterLink></template>
      </div>
      <form v-if="replying" class="comment-card__form" @submit.prevent="postReply">
        <label :for="`reply-${comment.id}`">Reply to {{ comment.authorName }}</label>
        <textarea :id="`reply-${comment.id}`" ref="replier" v-model="replyBody" name="reply" maxlength="2000" rows="2" required :disabled="busy" />
        <div><button class="lb-btn" type="button" :disabled="busy" @click="cancelReply">Cancel</button><button class="lb-btn lb-btn--primary" type="submit" :disabled="busy || !replyBody.trim()">Post reply</button></div>
      </form>
      <slot />
    </div>
    <!-- biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only closes its menu on Escape or focus leaving; the buttons inside are the interactive controls -->
    <div v-if="loggedIn" class="comment-card__menu" @keydown.esc.stop="menu = false" @focusout="leaveMenu">
      <button ref="moreButton" type="button" class="comment-card__more" aria-label="Comment options" :aria-expanded="menu" :disabled="busy" @click="menu = !menu">•••</button>
      <div v-if="menu" class="comment-card__menu-items">
        <template v-if="comment.canEdit ?? comment.canDelete"><button type="button" :disabled="busy" @click="edit">Edit comment</button><button type="button" class="comment-card__delete" :disabled="busy" @click="menu = false; emit('delete', $event)">Delete comment</button></template>
        <button v-else type="button" :disabled="busy" @click="menu = false; emit('report', $event)">Report comment</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.comment-card { position: relative; display: flex; align-items: flex-start; gap: 14px; padding: 20px; border-radius: 20px; background: var(--paper-white); }
.comment-card--reply { margin-left: 28px; }
.comment-card__avatar { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 50%; background: var(--coral-soft); color: var(--coral-deep); font-weight: 700; font-size: 1.125rem; }
.comment-card__content { flex: 1; min-width: 0; padding-right: 24px; }
.comment-card__heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; margin-bottom: 6px; font-size: .9375rem; }
.comment-card__author, .comment-card__reply-to { min-width: 0; overflow-wrap: anywhere; }
.comment-card__heading time, .comment-card__reply-to { color: var(--ink-muted); font-size: .8125rem; }
.comment-card__you { padding: 1px 8px; border-radius: 999px; background: var(--paper-hover); color: var(--ink-muted); font-size: .75rem; }
.comment-card__actions { display: flex; flex-wrap: wrap; align-items: center; column-gap: 18px; margin-top: 8px; }
.comment-card__actions :is(button,a) { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: transparent; color: var(--ink-muted); font: inherit; font-size: .875rem; text-decoration: none; cursor: pointer; min-height: 44px; touch-action: manipulation; transition: color 150ms ease; }
.comment-card__actions button[aria-pressed=true] { color: var(--coral-deep); font-weight: 700; }
.comment-card__actions svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; }
.comment-card__menu { position: absolute; top: 16px; right: 12px; }
.comment-card__more { border: 0; border-radius: 10px; background: transparent; color: var(--ink-muted); min-width: 44px; min-height: 44px; letter-spacing: 2px; cursor: pointer; touch-action: manipulation; transition: background-color 150ms ease, color 150ms ease; }
.comment-card__menu-items { position: absolute; right: 0; top: 36px; z-index: 3; display: grid; padding: 5px; min-width: 150px; max-width: calc(100vw - 32px); background: var(--paper-white); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: var(--shadow-card); }
.comment-card__menu-items button { min-height: 44px; border: 0; border-radius: 8px; padding: 10px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; white-space: nowrap; }
@media (hover: hover) and (pointer: fine) {
  .comment-card__actions :is(button,a):hover:not(:disabled) { color: var(--ink); }
  .comment-card__actions button[aria-pressed=true]:hover:not(:disabled) { color: var(--coral-deep); }
  .comment-card__more:hover:not(:disabled) { background: var(--paper-hover); color: var(--ink); }
  .comment-card__menu-items button:hover:not(:disabled) { background: var(--paper-hover); }
}
.comment-card__menu-items .comment-card__delete { color: var(--coral-deep); }
.comment-card__form { display: grid; gap: 8px; margin-top: 12px; }
.comment-card__form textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--hairline-strong); border-radius: 12px; padding: 10px; font: inherit; resize: vertical; color: var(--ink); background: var(--paper-white); }
.comment-card__form label { overflow-wrap: anywhere; }
@media (pointer: coarse) { .comment-card__form textarea { font-size: max(1rem, 1em); } }
.comment-card__form > div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
@media (max-width: 480px) { .comment-card { gap: 10px; padding: 14px; } .comment-card__avatar { width: 36px; height: 36px; } .comment-card--reply { margin-left: 14px; } }
</style>
