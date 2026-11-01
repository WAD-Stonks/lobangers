<script setup lang="ts">
import type { FlashCode, PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { ApiClientError } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import {
  codesLeftText,
  countdown,
  formatCents,
  radiusText,
  savingText,
} from '@web/modules/flash-drop/flash-format'
import { useFlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// The Flash Drop running for this deal, inside the deal panel: price, countdown and codes left,
// and the button that claims one code. A claimed code shows here and in My codes.
const props = defineProps<{ drop: PublicFlashDrop }>()

const flash = useFlashDrops()
const toast = useToast()
const session = authClient.useSession()
const route = useRoute()

const claiming = ref(false)
const error = ref('')
const signedIn = computed(() => !!session.value.data)
const now = computed(() => flash?.now.value ?? Date.now())
const code = computed<FlashCode | null>(() => flash?.codeForDrop(props.drop.id) ?? null)
const ended = computed(() => new Date(props.drop.endsAt).getTime() <= now.value)
const soldOut = computed(() => props.drop.codesLeft <= 0)
const saving = computed(() => savingText(props.drop.flashPriceCents, props.drop.usualPriceCents))
const loginTo = computed(() => ({ name: 'login', query: { redirect: route.fullPath } }))

const messageFor = (reason: unknown) => {
  if (reason instanceof ApiClientError) {
    if (reason.status === 401) return 'Log in again to claim this code.'
    if ([409, 412].includes(reason.status)) return reason.message
  }
  return 'Could not claim a code. Please try again.'
}

const claim = async () => {
  if (!flash || claiming.value) return
  claiming.value = true
  error.value = ''
  try {
    await flash.claim(props.drop.id)
    toast.show('Code saved in My codes.')
  } catch (reason) {
    error.value = messageFor(reason)
  } finally {
    claiming.value = false
  }
}
</script>

<template>
  <section class="flash-claim" aria-labelledby="flash-claim-title" data-testid="flash-claim">
    <header class="flash-claim__head">
      <span class="flash-claim__live" aria-hidden="true" />
      <h2 id="flash-claim-title" class="flash-claim__title">Flash drop</h2>
      <span v-if="drop.demo" class="flash-fake">Fake deal</span>
      <span class="flash-claim__timer" :aria-label="`Ends in ${countdown(drop.endsAt, now)}`">{{ countdown(drop.endsAt, now) }}</span>
    </header>
    <p class="flash-claim__price">
      <strong>{{ formatCents(drop.flashPriceCents) }}</strong>
      <s v-if="drop.usualPriceCents">{{ formatCents(drop.usualPriceCents) }}</s>
      <span v-if="saving" class="flash-claim__saving">{{ saving }}</span>
    </p>
    <p class="flash-claim__meta">
      {{ codesLeftText(drop) }} of {{ drop.codeLimit }} · for people within {{ radiusText(drop.radiusMetres) }}
    </p>

    <div v-if="code" class="flash-claim__code" data-testid="flash-code">
      <span class="flash-claim__code-label">Your code</span>
      <strong class="flash-claim__code-value">{{ code.code }}</strong>
      <span class="flash-claim__code-note">Show this at the counter before {{ countdown(drop.endsAt, now) }} runs out. It's saved in My codes.</span>
    </div>
    <p v-else-if="ended" class="flash-claim__note" role="status">This drop has ended.</p>
    <p v-else-if="soldOut" class="flash-claim__note" role="status">All the codes have been claimed.</p>
    <RouterLink v-else-if="!signedIn" class="lb-btn lb-btn--primary flash-claim__action" :to="loginTo">Log in to claim a code</RouterLink>
    <button
      v-else
      type="button"
      class="lb-btn lb-btn--primary flash-claim__action"
      data-testid="flash-claim-button"
      :disabled="claiming"
      @click="claim"
    >
      {{ claiming ? 'Claiming…' : 'Claim my code' }}
    </button>
    <p v-if="error" class="flash-claim__error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.flash-claim {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 14px 16px 16px;
  color: var(--paper-white);
  background: var(--ink-strong);
  border-radius: var(--radius-card, 18px);
}

.flash-claim__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flash-claim__live {
  width: 8px;
  height: 8px;
  background: var(--coral);
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(216, 96, 63, 0.25);
  animation: flash-claim-blink 1.2s ease-in-out infinite;
}

.flash-claim__title {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #f3a58e;
}

.flash-claim__timer {
  margin-left: auto;
  padding: 5px 9px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--coral);
  border-radius: 9px;
}

.flash-claim__price {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
}

.flash-claim__price strong {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1;
}

.flash-claim__price s {
  color: #c9c6bf;
}

.flash-claim__saving {
  padding: 3px 7px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  background: var(--sunny);
  border-radius: 8px;
}

.flash-claim__meta,
.flash-claim__note {
  margin: 0;
  font-size: var(--text-xs);
  color: #c9c6bf;
}

.flash-claim__note {
  color: var(--paper-white);
}

.flash-claim__action {
  align-self: stretch;
  margin-top: 4px;
}

.flash-claim__code {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  padding: 12px 14px;
  color: var(--ink);
  background: var(--paper-white);
  border: 2px dashed var(--coral);
  border-radius: 14px;
  animation: flash-claim-pop 260ms var(--ease-out) both;
}

.flash-claim__code-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.flash-claim__code-value {
  font-family: var(--font-display);
  font-size: 1.6rem;
  letter-spacing: 0.12em;
  font-variant-numeric: tabular-nums;
}

.flash-claim__code-note {
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.flash-claim__error {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  color: #f3a58e;
}

@keyframes flash-claim-blink {
  50% {
    opacity: 0.3;
  }
}

@keyframes flash-claim-pop {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flash-claim__live,
  .flash-claim__code {
    animation: none;
  }
}
</style>
