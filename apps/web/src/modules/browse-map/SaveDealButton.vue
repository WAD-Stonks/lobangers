<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{ dealId: string; title: string }>()
const session = authClient.useSession()
const saved = useSavedDeals()
const toast = useToast()
const route = useRoute()
const router = useRouter()
// Bumped on each save so the icon remounts and replays its pop.
const popKey = ref(0)
const isSaved = computed(() => saved.isSaved(props.dealId))
// A fixed name with aria-pressed: the pressed state already says whether it is saved.
const label = computed(() => `Save ${props.title}`)
const undoUnsave = () => {
  saved.toggle(props.dealId).catch((error: unknown) => {
    console.error('Could not restore saved deal', error)
    toast.show('Could not restore that deal. Try again.', { tone: 'error' })
  })
}
// Never locked: taps queue per deal in useSavedDeals, and the toast confirms at once
// because the icon already shows the result.
const toggle = async () => {
  if (!session.value.data) {
    await router.push({ name: 'auth-required', query: { ...route.query, tab: 'profile', redirect: route.fullPath } })
    return
  }
  const wasSaved = isSaved.value
  if (!wasSaved) popKey.value += 1
  const request = saved.toggle(props.dealId)
  toast.show(wasSaved ? 'Removed from saved' : 'Saved', wasSaved ? { action: { label: 'Undo', run: undoUnsave } } : {})
  try {
    await request
  } catch (error) {
    console.error('Could not update saved deal', error)
    toast.show('Could not update your saved deals. Try again.', { tone: 'error' })
  }
}
</script>

<template>
  <button class="save-deal-button" type="button" :aria-label="label" :title="label" :aria-pressed="isSaved" data-testid="item-save" @click.stop.prevent="toggle">
    <span :key="popKey" class="save-deal-button__icon" :class="{ 'is-popping': popKey > 0 }">
      <ShellIcon name="bookmark" :size="20" />
    </span>
  </button>
</template>

<style scoped>
.save-deal-button {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  color: var(--ink-muted);
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 50%;
  cursor: pointer;
  transition:
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease,
    color 150ms ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
@media (hover: hover) and (pointer: fine) {
  .save-deal-button:hover {
    background: var(--paper-hover);
  }
}
.save-deal-button:active {
  transform: scale(0.94);
}
.save-deal-button[aria-pressed='true'] {
  color: var(--coral-deep);
}
.save-deal-button__icon {
  display: inline-flex;
}
.save-deal-button__icon.is-popping {
  animation: shell-pop 220ms var(--ease-out);
}
.save-deal-button :deep(svg) {
  fill: currentColor;
  fill-opacity: 0;
  transition: fill-opacity var(--dur-small) var(--ease-out);
}
.save-deal-button[aria-pressed='true'] :deep(svg) {
  fill-opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .save-deal-button:active {
    transform: none;
  }
  .save-deal-button__icon.is-popping {
    animation: none;
  }
}
.save-deal-button:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}
</style>
