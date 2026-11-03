<script setup lang="ts">
import { adminReturnTo } from '@web/lib/admin-workflow-links'
import { computed, inject } from 'vue'
import { routerKey } from 'vue-router'

const props = defineProps<{ to: string; disabled?: boolean }>()
const router = inject(routerKey, null)
const destination = computed(() => adminReturnTo(props.to))
const follow = (event: MouseEvent) => {
  if (props.disabled || !destination.value) { event.preventDefault(); return }
  if (!router || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  void router.push(destination.value)
}
</script>

<template>
  <!-- biome-ignore lint/a11y/useAnchorContent: Callers supply the accessible link label through the default slot. -->
  <a :href="disabled ? undefined : destination" :aria-disabled="disabled || !destination ? true : undefined" :tabindex="disabled || !destination ? -1 : undefined" @click="follow"><slot /></a>
</template>
