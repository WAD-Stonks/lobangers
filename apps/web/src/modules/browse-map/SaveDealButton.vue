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
const pending = ref(false)
const isSaved = computed(() => saved.isSaved(props.dealId))
const label = computed(() => `${isSaved.value ? 'Unsave' : 'Save'} ${props.title}`)
const toggle = async () => {
  if (pending.value) return
  if (!session.value.data) {
    await router.push({ name: 'auth-required', query: { ...route.query, tab: 'profile', redirect: route.fullPath } })
    return
  }
  pending.value = true
  try {
    const result = await saved.toggle(props.dealId)
    toast.show(result ? 'Saved' : 'Removed from saved')
  } catch {
    toast.show('Could not update your saved deals. Try again.', { tone: 'error' })
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <button class="save-deal-button" type="button" :aria-label="label" :title="label" :aria-pressed="isSaved" :disabled="pending" data-testid="item-save" @click.stop.prevent="toggle">
    <ShellIcon name="bookmark" :size="20" />
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
}
.save-deal-button:hover {
  background: var(--paper-hover);
}
.save-deal-button[aria-pressed='true'] {
  color: var(--coral-deep);
}
.save-deal-button[aria-pressed='true'] :deep(svg) {
  fill: currentColor;
}
.save-deal-button:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}
.save-deal-button:disabled {
  cursor: wait;
  opacity: 0.65;
}
</style>
