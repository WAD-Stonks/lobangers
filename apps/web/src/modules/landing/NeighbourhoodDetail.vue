<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ x: number; y: number }>()
const clipId = `neighbourhood-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
</script>

<template>
  <svg class="neighbourhood-detail" viewBox="0 0 1000 666.667" aria-hidden="true" focusable="false">
    <defs>
      <clipPath :id="clipId">
        <rect x="-79" y="-61" width="158" height="122" rx="17" />
      </clipPath>
    </defs>
    <g :transform="`translate(${x} ${y})`">
      <image class="neighbourhood-art" href="/landing/neighbourhood-map.png" x="-79" y="-61" width="158" height="122" preserveAspectRatio="xMidYMid slice" :clip-path="`url(#${clipId})`" />
      <rect x="-79" y="-61" width="158" height="122" rx="17" fill="none" stroke="#fff3d8" stroke-width="2" />
    </g>
  </svg>
</template>
