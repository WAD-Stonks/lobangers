<script setup lang="ts">
import { categoryStyle } from '@web/modules/browse-map/category-style'
import { foodKindFor } from '@web/modules/browse-map/food-kind'
import { applyFoodSprite } from '@web/modules/browse-map/food-sprite'
import '@web/modules/browse-map/food-sprite.css'
import { onMounted, ref, watch } from 'vue'

// Tinted circle holding the category's 3D food, which spills slightly past the rim. Decorative:
// the category is always written out next to it, so the bubble is hidden from assistive
// technology. Lists show the still first frame so a long list stays calm; `animated` plays it.
const props = withDefaults(
  defineProps<{
    category: string
    // The deal's title and venue pick a specific dish (pasta, hotpot…) where one is named.
    title?: string
    venue?: string
    size?: 'sm' | 'md' | 'lg'
    animated?: boolean
  }>(),
  { title: '', venue: '', size: 'md', animated: false },
)

const food = ref<HTMLSpanElement | null>(null)

const paint = () => {
  if (!food.value) return
  food.value.className = 'category-bubble__food'
  food.value.removeAttribute('style')
  applyFoodSprite(food.value, foodKindFor({ category: props.category, title: props.title, venueNames: props.venue ? [props.venue] : [] }), {
    animated: props.animated,
    phase: 0,
  })
}

onMounted(paint)
watch(() => [props.category, props.title, props.venue, props.animated], paint)
</script>

<template>
  <span
    class="category-bubble"
    :class="`category-bubble--${size}`"
    :style="{ '--bubble-tint': categoryStyle(category).tint }"
    aria-hidden="true"
    data-testid="category-bubble"
  >
    <span ref="food" class="category-bubble__food" />
  </span>
</template>

<style scoped>
.category-bubble {
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: var(--bubble-size);
  height: var(--bubble-size);
  background: var(--bubble-tint);
  border-radius: 50%;
}

/* The model is a little larger than the circle and sits slightly high, so it reads as standing
   on the tint rather than being clipped inside it. */
.category-bubble__food {
  position: absolute;
  bottom: 4%;
  left: 50%;
  width: calc(var(--bubble-size) * 1.12);
  height: calc(var(--bubble-size) * 1.12);
  transform: translateX(-50%);
}

.category-bubble--sm {
  --bubble-size: 2.5rem;
}

.category-bubble--md {
  --bubble-size: 3.25rem;
}

.category-bubble--lg {
  --bubble-size: 3.5rem;
  border: 4px solid var(--paper-white);
}
</style>
