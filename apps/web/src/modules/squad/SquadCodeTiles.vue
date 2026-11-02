<script setup lang="ts">
import { useToast } from '@web/modules/map-shell/use-toast'
import { shareRoom } from '@web/modules/squad/share-room'
import { computed } from 'vue'

// The room code as four big tiles, with a copy of the invite link and the phone's share sheet.
const props = defineProps<{ code: string }>()
const toast = useToast()
const letters = computed(() => props.code.split(''))

const copy = async () => {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/squad/join?code=${props.code}`)
    toast.show('Invite link copied')
  } catch (error) {
    console.error('Could not copy the invite link', error)
    toast.show(`Could not copy. Tell your friends the code: ${props.code}`, { tone: 'error' })
  }
}

const share = async () => {
  const result = await shareRoom(props.code)
  if (result === 'copied') toast.show('Invite copied. Paste it to your friends.')
  else if (result === 'failed') toast.show(`Could not share. Tell your friends the code: ${props.code}`, { tone: 'error' })
}
</script>

<template>
  <div class="squad-code">
    <p class="squad-code__label">Room code</p>
    <p class="squad-code__tiles" translate="no" data-testid="squad-code-tiles" :data-code="code">
      <span class="visually-hidden">{{ letters.join(' ') }}</span>
      <span v-for="(letter, index) in letters" :key="index" class="squad-code__tile" aria-hidden="true">{{ letter }}</span>
    </p>
    <div class="squad-code__actions">
      <button type="button" class="lb-btn squad-btn-dark" @click="copy">Copy invite link</button>
      <button type="button" class="lb-btn lb-btn--primary" @click="share">Share code</button>
    </div>
  </div>
</template>
