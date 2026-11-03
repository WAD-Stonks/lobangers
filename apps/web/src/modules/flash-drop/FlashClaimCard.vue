<script setup lang="ts">
import type { FlashCode, PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { ApiClientError } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import {
  codesLeftText,
  countdown,
  formatCents,
  offerText,
  radiusText,
  savingText,
  useByText,
} from '@web/modules/flash-drop/flash-format'
import { useFlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// The Flash Drop running for this deal, inside the deal panel: price, the countdown to claim,
// codes left, and the button that claims one code. Claiming is short; a claimed code then works
// at the counter until it expires, and shows here and in My codes.
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
// A saving and a crossed-out usual price only make sense for a fixed flash price.
const fixedPrice = computed(() =>
  props.drop.offerType === 'FIXED_PRICE' ? props.drop.flashPriceCents : null,
)
const saving = computed(() =>
  fixedPrice.value === null ? null : savingText(fixedPrice.value, props.drop.usualPriceCents),
)
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
      <span class="flash-claim__timer"><span class="visually-hidden">Claiming closes in </span>{{ countdown(drop.endsAt, now) }}</span>
    </header>
    <p class="flash-claim__price">
      <strong>{{ offerText(drop) || 'Flash deal' }}</strong>
      <s v-if="fixedPrice !== null && drop.usualPriceCents"><span class="visually-hidden">Usual price </span>{{ formatCents(drop.usualPriceCents) }}</s>
      <span v-if="saving" class="flash-claim__saving">{{ saving }}</span>
    </p>
    <p class="flash-claim__meta">
      {{ codesLeftText(drop) }} of {{ drop.codeLimit }} · for people within {{ radiusText(drop.radiusMetres) }}
    </p>
    <p v-if="!code" class="flash-claim__meta" data-testid="flash-use-by">
      Claim before the timer runs out. {{ useByText(drop.codesExpireAt, now) }} at the counter.
    </p>

    <div v-if="code" class="flash-claim__code" data-testid="flash-code">
      <span class="flash-claim__code-label">Your code</span>
      <strong class="flash-claim__code-value" translate="no">{{ code.code }}</strong>
      <span class="flash-claim__code-note">{{ useByText(code.expiresAt, now) }}. Show it at the counter. It's saved in My codes.</span>
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
  /* A dark card by day. At night an inverted (light) card would glare inside a dark panel, so it
     becomes a raised dark surface with a coral edge instead. */
  --claim-bg: var(--ink-strong);
  --claim-text: var(--on-ink);
  --claim-accent: #f3a58e;
  --claim-muted: #c9c6bf;
  --claim-edge: transparent;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 14px 16px 16px;
  color: var(--claim-text);
  background: var(--claim-bg);
  border-radius: var(--radius-card, 18px);
  box-shadow: inset 0 0 0 1px var(--claim-edge);
}

.app-palette[data-theme='dark'] .flash-claim {
  --claim-bg: var(--paper-sunk);
  --claim-text: var(--ink);
  --claim-accent: var(--coral-deep);
  --claim-muted: var(--ink-muted);
  --claim-edge: var(--coral-ring);
}

.flash-claim__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
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
  color: var(--claim-accent);
}

.flash-claim__timer {
  margin-left: auto;
  padding: 5px 9px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--on-ink);
  background: var(--coral);
  border-radius: 9px;
}

.flash-claim__price {
  display: flex;
  flex-wrap: wrap;
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
  color: var(--claim-muted);
}

.flash-claim__saving {
  padding: 3px 7px;
  font-size: 12px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--sunny);
  border-radius: 8px;
}

.flash-claim__meta,
.flash-claim__note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--claim-muted);
}

.flash-claim__note {
  color: var(--claim-text);
}

.flash-claim__action {
  align-self: stretch;
  margin-top: 4px;
  touch-action: manipulation;
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
  overflow-wrap: anywhere;
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
  color: var(--claim-accent);
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
