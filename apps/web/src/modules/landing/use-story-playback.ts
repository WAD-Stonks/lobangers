import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

// Explicitly started playback only. Wheel, touch, keyboard or a hidden tab hands
// control straight back to the visitor; it never intercepts normal scrolling.
export function useStoryPlayback(root: Ref<HTMLElement | null>, reduced: Ref<boolean>) {
  const playing = ref(false)
  let frame = 0
  const stop = () => {
    playing.value = false
    cancelAnimationFrame(frame)
    frame = 0
  }
  const key = (event: KeyboardEvent) => {
    if (
      [
        'Escape',
        'Tab',
        'Enter',
        'ArrowDown',
        'ArrowUp',
        'PageDown',
        'PageUp',
        'Home',
        'End',
        ' ',
      ].includes(event.key)
    )
      stop()
  }
  const visibility = () => {
    if (document.hidden) stop()
  }
  const play = () => {
    if (playing.value) {
      stop()
      return
    }
    if (!root.value || reduced.value) return
    const start = window.scrollY
    const end =
      root.value.getBoundingClientRect().top +
      window.scrollY +
      root.value.offsetHeight -
      window.innerHeight
    const duration = Math.max(
      5000,
      26000 * Math.min(1, Math.max(0, (end - start) / root.value.offsetHeight)),
    )
    let began: number | undefined
    playing.value = true
    const tick = (time: number) => {
      if (!playing.value || reduced.value) {
        stop()
        return
      }
      began ??= time
      const t = Math.min(1, (time - began) / duration)
      window.scrollTo({ top: start + (end - start) * t, behavior: 'instant' })
      if (t < 1) frame = requestAnimationFrame(tick)
      else stop()
    }
    frame = requestAnimationFrame(tick)
  }
  onMounted(() => {
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchstart', stop, { passive: true })
    window.addEventListener('keydown', key)
    document.addEventListener('visibilitychange', visibility)
  })
  onBeforeUnmount(() => {
    stop()
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('keydown', key)
    document.removeEventListener('visibilitychange', visibility)
  })
  return { playing, play, stop }
}
