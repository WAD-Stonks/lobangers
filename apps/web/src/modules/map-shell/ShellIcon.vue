<script setup lang="ts">
import { TICKET_ICON_PATHS } from '@web/components/ticket-icon'
import { computed } from 'vue'

// Stroked 24x24 outline icons used across the shell. Always decorative: the button or text
// next to the icon carries the accessible name.
const ICONS = {
  ticket: TICKET_ICON_PATHS,
  calendar: ['M4 5h16v16H4z', 'M8 3v4', 'M16 3v4', 'M4 10h16'],
  sort: ['M7 3v18', 'm3 17 4 4 4-4', 'M17 21V3', 'm13 7 4-4 4 4'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  home: ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-8h6v8'],
  sidebar: ['M3 4h18v16H3z', 'M9 4v16'],
  edit: ['M20 13v8H3V4h10', 'm10 14 1-4 8-8 3 3-8 8z'],
  store: ['M3 10h18l-2-6H5z', 'M5 10v11h14V10', 'M9 21v-7h6v7'],
  help: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2', 'M12 17h.01'],
  logout: ['M9 4H4v16h5', 'M9 12h12', 'm16 7 5 5-5 5'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  bookmark: ['M6 4h12v17l-6-4-6 4z'],
  share: ['M12 15V3', 'm7 8 5-5 5 5', 'M5 12v9h14v-9'],
  chat: ['M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6z'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  flag: ['M5 21V3', 'M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0'],
  check: ['m5 12 5 5 9-10'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronUp: ['m6 15 6-6 6 6'],
  chevronLeft: ['m15 6-6 6 6 6'],
  chevronRight: ['m9 6 6 6-6 6'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  diamond: ['M12 3c.7 4.8 4.2 8.3 9 9-4.8.7-8.3 4.2-9 9-.7-4.8-4.2-8.3-9-9 4.8-.7 8.3-4.2 9-9z'],
  directions: ['M3 11 21 3l-8 18-2-8z'],
  filters: ['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M16 4v4', 'M10 10v4', 'M18 16v4'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  locate: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3'],
  map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z', 'M9 4v14', 'M15 6v14'],
  minus: ['M5 12h14'],
  pause: ['M9 5v14', 'M15 5v14'],
  play: ['M8 5v14l11-7z'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M20 12a8 8 0 1 1-3-6.2', 'M20 4v5h-5'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'],
  send: ['M12 19V5', 'm5 12 7-7 7 7'],
  walk: ['M13 4a1 1 0 1 0 0 .01', 'M10 21l2-6 3 3v3', 'M9 12l3-4 3 3 3 1', 'M12 8l-2 5'],
  user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4 21v-2a8 8 0 0 1 16 0v2'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  gift: ['M4 11h16v10H4z', 'M3 7h18v4H3z', 'M12 7v14', 'M12 7S10.5 3 8 3a2 2 0 0 0 0 4', 'M12 7s1.5-4 4-4a2 2 0 0 1 0 4'],
  percent: ['M19 5 5 19', 'M7 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4', 'M17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4'],
  tag: ['M3 12V4h8l10 10-8 8z', 'M7.5 7.5h.01'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  pin: ['M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z', 'M12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5'],
  arrowRight: ['M5 12h14', 'm13 6 6 6-6 6'],
} as const

export type ShellIconName = keyof typeof ICONS

const props = withDefaults(defineProps<{ name: ShellIconName; size?: number; strokeWidth?: number }>(), {
  size: 20,
  strokeWidth: 2,
})
const paths = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    class="shell-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>

<style scoped>
.shell-icon {
  flex: none;
}
</style>
