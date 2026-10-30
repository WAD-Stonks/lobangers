<script setup lang="ts">
withDefaults(defineProps<{ name: string }>(), { name: 'overview' })
const paths: Record<string, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  deals: 'M3 3h8l10 10-8 8L3 11z M7 7h.01',
  catalogue: 'M4 4h16v16H4z M4 9h16 M9 9v11',
  moderation: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M9 12l2 2 4-4',
  accounts: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  ingestion: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  audit: 'M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h5',
  sidebar: 'M3 4h18v16H3z M9 4v16',
  close: 'm6 6 12 12 M6 18 18 6',
  back: 'm10 5-7 7 7 7 M3 12h18',
  chevron: 'm8 10 4 4 4-4',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2 M12 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
}
</script>

<template>
  <svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="paths[name] || paths.overview" /></svg>
</template>
