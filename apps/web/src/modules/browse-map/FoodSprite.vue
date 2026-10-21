<script setup lang="ts">
import type { FoodKind } from '@web/modules/browse-map/food-kind'
import { applyFoodSprite, FOOD_SPRITE_CLASS } from '@web/modules/browse-map/food-sprite'
import '@web/modules/browse-map/food-sprite.css'
import { onMounted, ref, watch } from 'vue'

// One 3D food (see food-sprite.ts). Decorative, so it is hidden from assistive technology.
const props = withDefaults(defineProps<{ kind: FoodKind; animated?: boolean; large?: boolean }>(), {
  animated: false,
  large: false,
})

const el = ref<HTMLSpanElement | null>(null)

const paint = () => {
  if (!el.value) return
  // Reset only what the sprite owns; the parent's sizing class must survive.
  el.value.classList.remove(
    FOOD_SPRITE_CLASS,
    `${FOOD_SPRITE_CLASS}--alt`,
    `${FOOD_SPRITE_CLASS}--still`,
  )
  el.value.style.animationDelay = ''
  applyFoodSprite(el.value, props.kind, { animated: props.animated, phase: 0, large: props.large })
}

onMounted(paint)
watch(() => [props.kind, props.animated, props.large], paint)
</script>

<template>
  <span ref="el" aria-hidden="true" />
</template>
