<script setup lang="ts">
import { SQUAD_AVATARS, type SquadAvatar } from '@broke-oclock/contracts/squad'
import { AVATAR_NAMES, avatarUrl } from '@web/modules/squad/avatar-art'
import { useId } from 'vue'

// Pick your face: the six lobangers as a radio group, so arrow keys move between them and a
// screen reader hears each one's name.
defineProps<{ modelValue: SquadAvatar; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [avatar: SquadAvatar] }>()
const group = useId()
</script>

<template>
  <fieldset class="squad-faces" :disabled="disabled">
    <legend class="squad-field__label">Your face</legend>
    <div class="squad-faces__grid">
      <label v-for="avatar in SQUAD_AVATARS" :key="avatar" class="squad-face" :class="{ 'is-on': modelValue === avatar }">
        <input
          class="visually-hidden"
          type="radio"
          :name="group"
          :value="avatar"
          :checked="modelValue === avatar"
          :data-testid="`squad-avatar-${avatar}`"
          @change="emit('update:modelValue', avatar)"
        />
        <img :src="avatarUrl(avatar)" alt="" width="40" height="40" />
        <span class="visually-hidden">{{ AVATAR_NAMES[avatar] }}</span>
      </label>
    </div>
  </fieldset>
</template>
