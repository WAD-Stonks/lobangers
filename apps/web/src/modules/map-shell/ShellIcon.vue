<script setup lang="ts">
import { computed } from 'vue'

// Stroked 24x24 outline icons used across the shell. Always decorative: the button or text
// next to the icon carries the accessible name.
const ICONS = {
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  bookmark: ['M6 4h12v17l-6-4-6 4z'],
  check: ['m5 12 5 5 9-10'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronLeft: ['m15 6-6 6 6 6'],
  chevronRight: ['m9 6 6 6-6 6'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  directions: ['M3 11 21 3l-8 18-2-8z'],
  filters: ['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M16 4v4', 'M10 10v4', 'M18 16v4'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  locate: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3'],
  map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z', 'M9 4v14', 'M15 6v14'],
  minus: ['M5 12h14'],
  pause: ['M9 5v14', 'M15 5v14'],
  play: ['M8 5v14l11-7z'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M20 12a8 8 0 1 1-3-6.2', 'M20 4v5h-5'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'],
  walk: ['M13 4a1 1 0 1 0 0 .01', 'M10 21l2-6 3 3v3', 'M9 12l3-4 3 3 3 1', 'M12 8l-2 5'],
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
