<script setup lang="ts">
// The merchant dashboard's deal cards in rows: 4 across on wide screens, 3 on laptops, 2 on
// tablets and 1 on phones, so a card never gets too narrow to read. Put each card in an <li>.
</script>

<template>
  <ul class="merchant-grid">
    <slot />
  </ul>
</template>

<style scoped>
.merchant-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

@media (min-width: 576px) {
  .merchant-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 992px) {
  .merchant-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .merchant-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
