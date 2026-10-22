<script setup lang="ts">
import { regions } from '@web/modules/landing/deals'
import FoodMapPin from '@web/modules/landing/FoodMapPin.vue'

withDefaults(
  defineProps<{
    interactive?: boolean
    heroPins?: boolean
    artSrc?: string
    active?: number
    showPins?: boolean
    pinProgress?: number
    inactiveOpacity?: number
    activeOpacity?: number
  }>(),
  { interactive: true, heroPins: false, artSrc: '/landing/singapore-map-soft-sea.png', active: 0, showPins: true, pinProgress: 1, inactiveOpacity: 1, activeOpacity: 1 },
)
defineEmits<{ select: [index: number] }>()

</script>

<template>
  <div class="illustrated-map">
    <img :src="artSrc" :srcset="heroPins ? '/landing/singapore-map-hero-water-extended-768.webp 768w, /landing/singapore-map-hero-water-extended-1536.webp 1536w' : undefined" :sizes="heroPins ? '(max-width: 800px) 100vw, 70vw' : undefined" alt="Illustrated Singapore, from Woodlands and Sengkang to Jurong, Tampines and Marina Bay" width="1536" height="1024" class="island-art" fetchpriority="high" />
    <slot />
    <div class="island-markers" :class="{ 'pins-hidden': !showPins }">
      <button v-for="(region, index) in regions" :key="region.name" class="island-marker" :class="{ active: active === index }" :style="{ left: `${region.x}%`, top: `${heroPins && index === 1 ? 20 : region.y}%`, '--pin-color': '#fac7ba', '--pin-index': index, '--pin-enter': Math.max(0, Math.min(1, (pinProgress - index * .07) / .72)), opacity: (active === index ? activeOpacity : inactiveOpacity) * Math.max(0, Math.min(1, (pinProgress - index * .07) / .72)) }" type="button" :aria-label="heroPins ? `${region.name}: preview current food deals` : `${region.name}: preview sample food deal in ${region.area}`" :aria-pressed="interactive ? active === index : undefined" :disabled="!showPins || !interactive" @click="$emit('select', index)">
        <span class="pin-ring" aria-hidden="true" />
        <span v-if="heroPins" class="pin-ring pin-ring-secondary" aria-hidden="true" />
        <span class="pin-selection"><span class="hero-food-pin"><FoodMapPin :kind="index" /></span></span>
        <span class="pin-label">{{ region.name }}</span>
      </button>
    </div>
  </div>
</template>
