<script setup lang="ts">
import { avatarUrl, THUMBS_DOWN_URL } from '@web/modules/squad/avatar-art'
import type { SquadEffects } from '@web/modules/squad/use-squad-effects'

defineProps<{ effects: SquadEffects }>()
</script>

<template>
  <div class="squad-fx" aria-hidden="true">
    <span
      v-for="sticker in effects.stickers.value"
      :key="sticker.id"
      class="squad-fx__sticker"
      :style="{
        left: `${sticker.x}px`,
        top: `${sticker.y}px`,
        '--fx-from-x': `${sticker.fromX}px`,
        '--fx-from-y': `${sticker.fromY}px`,
        '--fx-rotate': `${sticker.rotate}deg`,
      }"
    >
      <img :src="avatarUrl(sticker.avatar)" alt="" width="46" height="46" />
    </span>
    <span v-for="burst in effects.bursts.value" :key="`b${burst.id}`" class="squad-fx__burst" :style="{ left: `${burst.x}px`, top: `${burst.y}px` }">
      <svg aria-hidden="true" viewBox="0 0 120 120"><polygon points="60,4 70,34 98,14 86,44 116,46 90,62 112,86 80,80 82,112 62,90 44,116 40,84 8,96 28,70 4,52 34,46 18,18 48,32" /></svg>
      <span>YAY!!</span>
    </span>
    <span
      v-for="drop in effects.drops.value"
      :key="`d${drop.id}`"
      class="squad-fx__drop"
      :style="{ left: `${drop.x}px`, animationDelay: `${drop.delay}ms`, '--fx-rotate': `${drop.rotate}deg`, '--fx-y': drop.y }"
    >
      <img :src="THUMBS_DOWN_URL" alt="" width="38" height="38" />
    </span>
    <span v-for="whoosh in effects.whooshes.value" :key="`w${whoosh.id}`" class="squad-fx__whoosh" :class="`squad-fx__whoosh--${whoosh.kind}`">
      {{ whoosh.text }}
    </span>
  </div>
</template>
