<script setup lang="ts">
import type { SquadDeal } from '@broke-oclock/contracts/squad'
import { categoryStyle } from '@web/modules/browse-map/category-style'
import FoodSprite from '@web/modules/browse-map/FoodSprite.vue'
import { foodKindFor } from '@web/modules/browse-map/food-kind'
import { computed, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

// The deal the room is voting on. The photo is where yay stickers land; tapping the card opens
// the deal's full details (a real link, so it can open in a new tab), and Back returns to the room.
const props = defineProps<{ deal: SquadDeal; position: string; to: RouteLocationRaw }>()

const photo = ref<HTMLElement | null>(null)
const kind = computed(() =>
  foodKindFor({ category: props.deal.category, title: props.deal.title, venueNames: props.deal.venueName ? [props.deal.venueName] : [] }),
)
const tint = computed(() => categoryStyle(props.deal.category).tint)

defineExpose({ photo })
</script>

<template>
  <RouterLink
    :to="to"
    class="squad-card"
    data-testid="squad-deal"
    :aria-label="`${deal.title}, ${deal.label}. Open the deal's details`"
  >
    <span ref="photo" class="squad-card__photo" :style="{ '--squad-tint': tint }">
      <img v-if="deal.imageUrl" class="squad-card__image" :src="deal.imageUrl" alt="" width="480" height="190" />
      <FoodSprite v-else class="squad-card__food" :kind="kind" animated large />
      <span class="squad-card__position">{{ position }}</span>
    </span>
    <span class="squad-card__text">
      <span class="squad-card__title">{{ deal.title }}</span>
      <span class="squad-card__meta">
        <span v-if="deal.venueName" class="squad-card__venue">{{ deal.venueName }}</span>
        <strong class="squad-card__price">{{ deal.label }}</strong>
      </span>
      <span class="squad-card__hint">Tap for details, comments and directions</span>
    </span>
  </RouterLink>
</template>
