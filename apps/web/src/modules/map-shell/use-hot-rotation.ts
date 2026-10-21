import { computed, onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'

export const HOT_INTERVAL_MS = 4500

type Options = { readonly reducedMotion: Readonly<Ref<boolean>> }

// Timer for the "Hot right now" card. It runs only while nobody is reading the card (no hover,
// no keyboard focus), the tab is visible, the visitor hasn't paused it and motion is allowed.
// With reduced motion it never starts; the dots still move it by hand.
export const useHotRotation = (count: Readonly<Ref<number>>, options: Options) => {
  const index = ref(0)
  const paused = ref(false)
  const hovering = ref(false)
  const focused = ref(false)
  const hidden = ref(typeof document !== 'undefined' && document.hidden)
  let timer: ReturnType<typeof setTimeout> | null = null

  const running = computed(
    () =>
      count.value > 1 &&
      !options.reducedMotion.value &&
      !paused.value &&
      !hovering.value &&
      !focused.value &&
      !hidden.value,
  )

  const stop = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  // One timeout per card, restarted whenever the card changes, so the progress bar and the
  // timer always agree.
  const schedule = () => {
    stop()
    if (!running.value) return
    timer = setTimeout(() => {
      index.value = (index.value + 1) % count.value
    }, HOT_INTERVAL_MS)
  }

  const onVisibility = () => {
    hidden.value = document.hidden
  }

  watch([running, index], schedule)
  watch(count, (total) => {
    if (index.value >= total) index.value = 0
  })

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility)
    schedule()
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    stop()
  })

  return {
    index,
    paused,
    running,
    setHover: (value: boolean) => {
      hovering.value = value
    },
    setFocus: (value: boolean) => {
      focused.value = value
    },
    toggle: () => {
      paused.value = !paused.value
    },
    pick: (next: number) => {
      if (next >= 0 && next < count.value) index.value = next
    },
  }
}
