<script setup lang="ts">
// The round icon that sits half above a result banner: hands that clap for a match, an X that
// draws itself for a no-match. Styled in squad-results.css; still under reduced motion.
defineProps<{ kind: 'match' | 'miss' }>()
</script>

<template>
  <div class="squad-result-badge" :class="`squad-result-badge--${kind}`" aria-hidden="true">
    <svg v-if="kind === 'match'" viewBox="0 0 24 24" width="30" height="30">
      <g class="squad-result-badge__sparks" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <path d="M12 0.8v2.2M6.6 2.4l1.2 1.8M17.4 2.4l-1.2 1.8" />
      </g>
      <g class="squad-result-badge__hand squad-result-badge__hand--left">
        <rect x="4.6" y="6" width="7.4" height="14" rx="3.7" />
        <rect x="2.6" y="12" width="3.4" height="6.4" rx="1.7" />
      </g>
      <g class="squad-result-badge__hand squad-result-badge__hand--right">
        <rect x="12" y="6" width="7.4" height="14" rx="3.7" />
        <rect x="18" y="12" width="3.4" height="6.4" rx="1.7" />
      </g>
    </svg>
    <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
      <path class="squad-result-badge__stroke" pathLength="1" d="M7 7l10 10" />
      <path class="squad-result-badge__stroke squad-result-badge__stroke--second" pathLength="1" d="M17 7 7 17" />
    </svg>
  </div>
</template>
