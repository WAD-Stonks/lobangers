<script setup lang="ts">
defineProps<{ kind: number }>()
</script>

<template>
  <svg class="food-map-pin" viewBox="0 0 80 106" aria-hidden="true" focusable="false">
    <ellipse cx="40" cy="99" rx="13" ry="4" fill="#79523e" opacity="0.2" />
    <circle class="food-pin-anchor" cx="40" cy="96" r="6" fill="var(--pin-color)" stroke="white" stroke-width="3" />
    <path d="M40 4C20 4 5 19 5 39C5 57 24 77 40 91C56 77 75 57 75 39C75 19 60 4 40 4Z" fill="var(--pin-color)" stroke="white" stroke-width="6" stroke-linejoin="round" />
    <g fill="#2c2926" stroke="#2c2926" stroke-linecap="round" stroke-linejoin="round">
      <g v-if="kind === 0" fill="none" stroke-width="3.5">
        <path d="M23 24V36Q28 41 33 36V24 M28 24V57 M23 32H33 M48 57V24Q58 28 56 42H48" />
      </g>
      <g v-else-if="kind === 1">
        <path d="M25 39H55L51 59H29Z" stroke-width="2" />
        <path d="M24 37Q22 29 31 28Q30 20 39 19Q49 20 48 28Q58 29 56 37Z" stroke="none" />
        <path d="M34 44L36 54 M46 44L44 54" fill="none" stroke="var(--pin-color)" stroke-width="2" />
        <circle cx="40" cy="16" r="3" stroke="none" />
      </g>
      <g v-else-if="kind === 2">
        <path d="M22 36H49V42Q49 55 36 55Q23 55 23 42Z" stroke="none" />
        <path d="M49 38H54Q62 44 50 48 M21 58H55 M33 29Q28 25 33 21 M42 29Q37 25 42 21" fill="none" stroke-width="3" />
      </g>
      <g v-else-if="kind === 3">
        <path d="M26 30H54L50 60H30Z" fill="none" stroke-width="3" />
        <path d="M25 29H55 M42 30L47 17" fill="none" stroke-width="3" />
        <path d="M30 37H50L47 56H33Z" stroke="none" opacity="0.9" />
        <g fill="var(--pin-color)" stroke="none"><circle cx="36" cy="48" r="2" /><circle cx="44" cy="45" r="2" /><circle cx="42" cy="53" r="2" /><circle cx="36" cy="54" r="1.6" /></g>
      </g>
      <g v-else stroke="none">
        <path d="M31 29Q40 24 49 29L45 56H35Z M27 30L32 55Q21 55 19 47Q17 38 27 30Z M53 30Q63 38 61 47Q59 55 48 55Z M16 40Q10 45 15 53L23 57L20 49Z M64 40L60 49L57 57L65 53Q70 45 64 40Z" />
      </g>
    </g>
  </svg>
</template>
