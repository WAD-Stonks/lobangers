<script setup lang="ts">
import '@web/components/auth/auth.css'
import { type LobbieSprite, lobbieSpriteUrl } from '@web/modules/lobbie/sprites'
import { computed } from 'vue'

const props = defineProps<{ covering: boolean }>()
const sprites: readonly LobbieSprite[] = ['password-hidden', 'password-shown']
const pose = computed<LobbieSprite>(() => (props.covering ? 'password-shown' : 'password-hidden'))
</script>

<template>
  <div class="auth-lobbie" :data-pose="pose" aria-hidden="true">
    <span v-for="sprite in sprites" :key="sprite" class="auth-lobbie__sprite" :data-sprite="sprite" :class="{ 'is-active': sprite === pose }">
      <img :src="lobbieSpriteUrl(sprite)" alt="" width="280" height="240" />
      <img :src="lobbieSpriteUrl(sprite)" alt="" width="280" height="240" class="auth-lobbie__antennae" />
    </span>
  </div>
</template>
