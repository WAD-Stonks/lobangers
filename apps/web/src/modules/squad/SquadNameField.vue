<script setup lang="ts">
import { SQUAD_NAME_MAX, type SquadAvatar } from '@broke-oclock/contracts/squad'
import { avatarUrl } from '@web/modules/squad/avatar-art'
import { computed, useId } from 'vue'

// "Join as ___": the name the squad sees, next to the chosen face. The error sits under the box
// and is tied to the input so a screen reader reads it on focus.
const props = withDefaults(
  defineProps<{ modelValue: string; avatar: SquadAvatar; error?: string; label?: string; disabled?: boolean }>(),
  { error: '', label: 'Your name', disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [name: string] }>()

const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`
const describedBy = computed(() => (props.error ? `${errorId} ${hintId}` : hintId))
</script>

<template>
  <div class="squad-field">
    <label class="squad-field__label" :for="id">{{ label }}</label>
    <span class="squad-namebox" :class="{ 'is-bad': error }">
      <img :src="avatarUrl(avatar)" alt="" width="34" height="34" />
      <input
        :id="id"
        name="displayName"
        type="text"
        :value="modelValue"
        :maxlength="SQUAD_NAME_MAX"
        :disabled="disabled"
        placeholder="Your name…"
        autocomplete="nickname"
        spellcheck="false"
        enterkeyhint="go"
        data-testid="squad-name"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="describedBy"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </span>
    <p v-if="error" :id="errorId" class="squad-error" role="alert">{{ error }}</p>
    <p :id="hintId" class="squad-field__hint">This is the name your squad sees. Up to {{ SQUAD_NAME_MAX }} letters.</p>
  </div>
</template>
