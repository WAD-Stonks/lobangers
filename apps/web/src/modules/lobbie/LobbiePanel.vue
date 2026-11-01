<script setup lang="ts">
import { ASSISTANT_MESSAGE_MAX_CHARS } from '@broke-oclock/contracts/assistant'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import { filterTokens } from '@web/modules/lobbie/filter-labels'
import { lobbieSpriteUrl, PRELOAD_SPRITES } from '@web/modules/lobbie/sprites'
import { LOBBIE_SUGGESTIONS, useLobbieChat } from '@web/modules/lobbie/use-lobbie-chat'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { browseLocation, lobbieDealLocation } from '@web/modules/map-shell/shell-routes'
import { useShell } from '@web/modules/map-shell/shell-state'
import { usePrefersReducedMotion } from '@web/modules/map-shell/use-breakpoint'
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'


const chat = useLobbieChat()
const shell = useShell()
const route = useRoute()
const inputId = useId()
const reducedMotion = usePrefersReducedMotion()

const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
const log = ref<HTMLOListElement | null>(null)
let refocus = false

const backTo = computed(() => browseLocation(route.query))
const showSuggestions = computed(() => !chat.entries.value.some((entry) => entry.role === 'user'))
const canSend = computed(() => draft.value.trim().length > 0 && !chat.pending.value)
const activeTokens = computed(() => filterTokens(chat.activeFilters.value))

onMounted(() => {
  for (const sprite of PRELOAD_SPRITES) new Image().src = lobbieSpriteUrl(sprite)
})

const toDeal = (row: DealRow) => lobbieDealLocation(route.query, row.deal.id, row.venue.id)

const submit = () => {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  refocus = true
  void chat.ask(text)
}

const pick = (suggestion: string) => {
  refocus = false
  void chat.ask(suggestion)
}


watch(
  () => [chat.entries.value.length, chat.pending.value] as const,
  async ([, pending], [, wasPending]) => {
    await nextTick()
    const last = log.value?.lastElementChild
    if (!(last instanceof HTMLElement)) return
    const replyArrived = wasPending && !pending
    last.scrollIntoView?.({
      block: replyArrived ? 'start' : 'end',
      behavior: reducedMotion.value ? 'auto' : 'smooth',
    })
    if (replyArrived && refocus) input.value?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <PanelFrame title="Ask Lobbie" :back="backTo" back-label="Back to results">
    <ol ref="log" class="lobbie__log" role="log" aria-live="polite" aria-label="Chat with Lobbie" data-testid="lobbie-log">
      <li
        v-for="entry in chat.entries.value"
        :key="entry.id"
        class="lobbie__entry"
        :class="`lobbie__entry--${entry.role}`"
        data-testid="lobbie-message"
      >
        <p v-if="entry.role === 'notice'" class="lobbie__notice" data-testid="lobbie-notice">{{ entry.text }}</p>
        <div v-else class="lobbie__said">
          <img
            v-if="entry.role === 'assistant'"
            class="lobbie__avatar"
            :src="lobbieSpriteUrl(entry.sprite)"
            alt=""
            width="56"
            height="56"
            decoding="async"
            data-testid="lobbie-avatar"
            :data-sprite="entry.sprite"
          />
          <p
            class="lobbie__bubble"
            :class="{ 'lobbie__bubble--failed': entry.role === 'assistant' && entry.failed }"
          >
            <span class="visually-hidden">{{ entry.role === 'user' ? 'You' : 'Lobbie' }}: </span>{{ entry.text }}
          </p>
        </div>

        <template v-if="entry.role === 'assistant'">
          <DealRowList
            v-if="entry.deals.length > 0"
            class="lobbie__deals"
            :rows="chat.rowsFor(entry.deals)"
            :to="toDeal"
            :hot-venue-id="shell.hoveredVenueId.value"
            test-id="lobbie-deals"
            @hover="shell.setHovered"
          />
          <fieldset v-if="entry.id === 0 && showSuggestions" class="lobbie__suggestions">
            <legend class="visually-hidden">Suggested questions</legend>
            <button
              v-for="suggestion in LOBBIE_SUGGESTIONS"
              :key="suggestion"
              type="button"
              class="lobbie__suggestion"
              :disabled="chat.pending.value"
              data-testid="lobbie-suggestion"
              @click="pick(suggestion)"
            >
              {{ suggestion }}
            </button>
          </fieldset>
        </template>
      </li>

      <li v-if="chat.pending.value" class="lobbie__entry lobbie__entry--assistant" data-testid="lobbie-typing">
        <div class="lobbie__said">
          <img
            class="lobbie__avatar lobbie__avatar--thinking"
            :src="lobbieSpriteUrl('thinking')"
            alt=""
            width="56"
            height="56"
            decoding="async"
            data-testid="lobbie-avatar"
            data-sprite="thinking"
          />
          <p class="lobbie__bubble lobbie__typing">
            <span class="visually-hidden">Lobbie is typing</span>
            <span class="lobbie__dot" aria-hidden="true" />
            <span class="lobbie__dot" aria-hidden="true" />
            <span class="lobbie__dot" aria-hidden="true" />
          </p>
        </div>
      </li>
    </ol>

    <template #actions>
      <div class="lobbie__bottom">
      <fieldset v-if="activeTokens.length > 0" class="lobbie__active" data-testid="lobbie-active-filters">
        <legend class="visually-hidden">Filters Lobbie is using</legend>
        <button
          v-for="token in activeTokens"
          :key="token.key"
          type="button"
          class="lobbie__chip"
          :disabled="chat.pending.value"
          :aria-label="`Remove filter ${token.label}`"
          @click="chat.removeFilter(token)"
        >
          <span class="lb-text-wrap">{{ token.label }}</span><ShellIcon name="close" :size="14" :stroke-width="2.4" />
        </button>
        <button
          type="button"
          class="lobbie__chip lobbie__chip--clear"
          :disabled="chat.pending.value"
          data-testid="lobbie-clear-filters"
          @click="chat.clearFilters"
        >
          Clear all
        </button>
      </fieldset>
      <form class="lobbie__composer" data-testid="lobbie-composer" @submit.prevent="submit">
        <label class="visually-hidden" :for="inputId">Message Lobbie</label>
        <input
          :id="inputId"
          ref="input"
          v-model="draft"
          class="lobbie__input"
          type="text"
          :maxlength="ASSISTANT_MESSAGE_MAX_CHARS"
          :disabled="chat.pending.value"
          :placeholder="chat.pending.value ? 'Lobbie is typing…' : 'Ask for a lobang…'"
          autocomplete="off"
          enterkeyhint="send"
          data-testid="lobbie-input"
        />
        <button
          type="submit"
          class="lobbie__send"
          :disabled="!canSend"
          aria-label="Send message"
          data-testid="lobbie-send"
        >
          <ShellIcon name="send" :size="18" :stroke-width="2.4" />
        </button>
      </form>
      </div>
    </template>
  </PanelFrame>
</template>

<style scoped>
.lobbie__log {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lobbie__entry {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  scroll-margin: var(--space-4);
  animation: lobbie-in var(--dur-small) var(--ease-out);
}

.lobbie__entry--user {
  align-items: flex-end;
}

.lobbie__bubble {
  max-width: 88%;
  margin: 0;
  padding: 10px 14px;
  font-size: var(--text-sm);
  line-height: 1.45;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: var(--ink);
  background: var(--sunny-wash);
  border-radius: 18px 18px 18px 6px;
}

.lobbie__entry--assistant .lobbie__bubble {
  align-self: flex-start;
}

.lobbie__said {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  min-width: 0;
}

.lobbie__said .lobbie__bubble {
  max-width: none;
}

.lobbie__entry--user .lobbie__said {
  max-width: 88%;
}

.lobbie__avatar {
  flex: none;
  width: 56px;
  height: 56px;
  object-fit: contain;
  animation: lobbie-pop var(--dur-small) var(--ease-out);
}

/* While Lobbie thinks, it bobs gently. */
.lobbie__avatar--thinking {
  animation: lobbie-bob 1.6s ease-in-out infinite;
}

.lobbie__entry--user .lobbie__bubble {
  color: var(--paper-white);
  background: var(--ink-strong);
  border-radius: 18px 18px 6px 18px;
}

.lobbie__bubble--failed {
  color: var(--tag-end-ink);
  background: var(--tag-end-bg);
}

.lobbie__notice {
  align-self: center;
  margin: 0;
  padding: 2px 12px;
  font: 600 0.75rem / 1.4 var(--font-sans);
  color: var(--ink-muted);
  background: var(--paper-sunk);
  border-radius: var(--radius-pill);
}

.lobbie__deals {
  margin: 0;
}

.lobbie__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.lobbie__suggestion {
  min-height: var(--hit);
  padding: 0 16px;
  font: 600 0.8125rem / 1.2 var(--font-sans);
  color: var(--ink);
  background: var(--paper-white);
  border: 1px solid var(--sunny-deep);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition:
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.lobbie__suggestion:hover:not(:disabled) {
  background: var(--sunny-wash);
}

.lobbie__suggestion:active:not(:disabled) {
  transform: scale(0.97);
}

.lobbie__suggestion:disabled {
  cursor: progress;
  opacity: 0.6;
}

.lobbie__suggestion:focus-visible,
.lobbie__send:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.lobbie__typing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 40px;
}

.lobbie__dot {
  width: 7px;
  height: 7px;
  background: var(--ink-muted);
  border-radius: 50%;
  animation: lobbie-typing 1.2s ease-in-out infinite;
}

.lobbie__dot:nth-child(3) {
  animation-delay: 0.15s;
}

.lobbie__dot:nth-child(4) {
  animation-delay: 0.3s;
}

.lobbie__bottom {
  display: flex;
  flex-direction: column;
  grid-column: 1 / -1;
  gap: var(--space-2);
  min-width: 0;
}

.lobbie__active {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.lobbie__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: var(--hit);
  padding: 0 8px 0 12px;
  font: 600 0.75rem / 1.2 var(--font-sans);
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background-color 150ms ease;
}

.lobbie__chip:hover:not(:disabled) {
  background: var(--tag-end-bg);
}

.lobbie__chip--clear {
  padding: 0 10px;
  color: var(--coral-deep);
  background: transparent;
  border-color: transparent;
}

.lobbie__chip:disabled {
  cursor: progress;
  opacity: 0.6;
}

.lobbie__chip:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.lobbie__composer {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}

.lobbie__input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--hit);
  padding: 0 16px;
  font: 500 var(--text-sm) / 1.2 var(--font-sans);
  color: var(--ink);
  background: var(--paper-sunk);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  outline: none;
  transition:
    border-color 150ms ease,
    background-color 150ms ease;
}

.lobbie__input:focus-visible {
  background: var(--paper-white);
  border-color: var(--hairline-strong);
  box-shadow: 0 0 0 3px var(--sunny-ring);
}

.lobbie__input:disabled {
  cursor: progress;
  opacity: 0.7;
}

.lobbie__send {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  color: var(--paper-white);
  background: var(--ink-strong);
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition:
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease,
    opacity 150ms ease;
}

.lobbie__send:hover:not(:disabled) {
  background: var(--ink-strong-hover);
}

.lobbie__send:active:not(:disabled) {
  transform: scale(0.94);
}

.lobbie__send:disabled {
  cursor: default;
  opacity: 0.35;
}

@keyframes lobbie-pop {
  from {
    transform: scale(0.85);
  }
}

@keyframes lobbie-bob {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-3px);
  }
}

@keyframes lobbie-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@keyframes lobbie-typing {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lobbie__entry,
  .lobbie__avatar,
  .lobbie__avatar--thinking {
    animation: none;
  }

  .lobbie__dot {
    animation-duration: 2.4s;
    animation-name: lobbie-typing-fade;
  }
}

@keyframes lobbie-typing-fade {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
}
</style>
