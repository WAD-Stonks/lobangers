<script setup lang="ts">
import type { CommunityComment } from '@broke-oclock/contracts/community'
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
const age = computed(() => {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(props.comment.createdAt)) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  return new Date(props.comment.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
})
const edit = async () => {
  menu.value = false
  editBody.value = props.comment.body
  editing.value = true
  await nextTick()
  editor.value?.focus()
}
const reply = async () => {
  replying.value = !replying.value
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
        <strong>{{ comment.authorName }}</strong><span v-if="comment.canDelete" class="comment-card__you">You</span>
        <time :datetime="comment.createdAt" :title="new Date(comment.createdAt).toLocaleString('en-SG')">· {{ age }}<span v-if="comment.editedAt"> · Edited</span></time>
      </header>
      <p v-if="comment.parentId" class="comment-card__reply-to">Replying to {{ comment.replyToName || 'a comment' }}</p>
      <form v-if="editing" class="comment-card__form" @submit.prevent="save">
        <textarea ref="editor" v-model="editBody" aria-label="Edit comment" maxlength="2000" rows="3" required :disabled="busy" />
        <div><button class="lb-btn" type="button" :disabled="busy" @click="editing = false">Cancel</button><button class="lb-btn lb-btn--primary" type="submit" :disabled="busy || !editBody.trim()">Save changes</button></div>
      </form>
      <CommentBody v-else :body="comment.body" />
      <div class="comment-card__actions">
        <template v-if="loggedIn">
          <button type="button" :aria-pressed="Boolean(comment.liked)" :disabled="busy" @click="toggleLike"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H3V10h4Zm0 0 5-8c2 0 3 2 2 5l-1 3h6c2 0 2 2 2 3l-2 7c0 1-1 1-2 1H7" /></svg>{{ comment.liked ? 'Liked' : 'Like' }}<span v-if="comment.likeCount">{{ comment.likeCount }}</span></button>
          <button type="button" :aria-expanded="replying" :disabled="busy" @click="reply"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" /></svg>Reply</button>
        </template>
        <template v-else><RouterLink :to="login">Like<span v-if="comment.likeCount"> {{ comment.likeCount }}</span></RouterLink><RouterLink :to="login">Reply</RouterLink></template>
      </div>
      <form v-if="replying" class="comment-card__form" @submit.prevent="postReply">
        <label :for="`reply-${comment.id}`">Reply to {{ comment.authorName }}</label>
        <textarea :id="`reply-${comment.id}`" ref="replier" v-model="replyBody" maxlength="2000" rows="2" required :disabled="busy" />
        <div><button class="lb-btn" type="button" :disabled="busy" @click="replying = false">Cancel</button><button class="lb-btn lb-btn--primary" type="submit" :disabled="busy || !replyBody.trim()">Post reply</button></div>
      </form>
      <slot />
    </div>
    <!-- biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only closes its menu on Escape or focus leaving; the buttons inside are the interactive controls -->
    <div v-if="loggedIn" class="comment-card__menu" @keydown.esc.stop="menu = false" @focusout="leaveMenu">
      <button type="button" class="comment-card__more" aria-label="Comment options" :aria-expanded="menu" :disabled="busy" @click="menu = !menu">•••</button>
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
.comment-card__heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px; font-size: .9375rem; }
.comment-card__heading time, .comment-card__reply-to { color: var(--ink-muted); font-size: .8125rem; }
.comment-card__you { padding: 1px 8px; border-radius: 999px; background: var(--paper-hover); color: var(--ink-muted); font-size: .75rem; }
.comment-card__actions { display: flex; align-items: center; gap: 18px; margin-top: 16px; }
.comment-card__actions :is(button,a) { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: transparent; color: var(--ink-muted); font: inherit; font-size: .875rem; text-decoration: none; cursor: pointer; min-height: 28px; }
.comment-card__actions button[aria-pressed=true] { color: var(--coral-deep); font-weight: 700; }
.comment-card__actions svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; }
.comment-card__menu { position: absolute; top: 16px; right: 12px; }
.comment-card__more { border: 0; background: transparent; color: var(--ink-muted); min-width: 36px; min-height: 36px; letter-spacing: 2px; cursor: pointer; }
.comment-card__menu-items { position: absolute; right: 0; top: 36px; z-index: 3; display: grid; padding: 5px; min-width: 150px; background: var(--paper-white); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: var(--shadow-card); }
.comment-card__menu-items button { border: 0; border-radius: 8px; padding: 10px; background: transparent; font: inherit; text-align: left; cursor: pointer; white-space: nowrap; }
.comment-card__menu-items button:hover { background: var(--paper-hover); }
.comment-card__menu-items .comment-card__delete { color: var(--bs-danger); }
.comment-card__form { display: grid; gap: 8px; margin-top: 12px; }
.comment-card__form textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--hairline-strong); border-radius: 12px; padding: 10px; font: inherit; resize: vertical; }
.comment-card__form > div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
@media (max-width: 480px) { .comment-card { gap: 10px; padding: 14px; } .comment-card__avatar { width: 36px; height: 36px; } .comment-card--reply { margin-left: 14px; } }
</style>
