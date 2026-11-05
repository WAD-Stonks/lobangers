<script setup lang="ts">
import { THUMBS_DOWN_URL, THUMBS_UP_URL } from '@web/modules/squad/avatar-art'

defineProps<{ kind: string }>()
</script>

<template>
  <span class="squad-seat__badge" :class="`squad-seat__badge--${kind}`" aria-hidden="true">
    <img v-if="kind === 'yay'" :src="THUMBS_UP_URL" alt="" width="14" height="14" />
    <img v-else-if="kind === 'nah'" :src="THUMBS_DOWN_URL" alt="" width="14" height="14" />
    <svg v-else-if="kind === 'watch'" aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
    <template v-else-if="kind === 'again'">↺</template>
    <template v-else-if="kind === 'next'">→</template>
    <template v-else-if="kind === 'away'">z</template>
    <template v-else>…</template>
  </span>
</template>
