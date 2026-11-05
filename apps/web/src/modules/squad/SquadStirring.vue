<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ hostName?: string | null; isHost?: boolean }>(), {
  hostName: null,
  isHost: false,
})
const emit = defineEmits<{ done: [] }>()

const STEP_MS = 800
const count = ref(3)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    if (count.value <= 1) {
      if (timer) clearInterval(timer)
      emit('done')
      return
    }
    count.value -= 1
  }, STEP_MS)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const caption = () =>
  props.isHost || !props.hostName ? 'Stirring the pot…' : `${props.hostName} is stirring the pot…`
</script>

<template>
  <div class="squad-stir" role="status" data-testid="squad-stirring">
    <span :key="count" class="squad-stir__num" aria-hidden="true">{{ count }}</span>
    <span class="squad-stir__caption">{{ caption() }}</span>
  </div>
</template>
