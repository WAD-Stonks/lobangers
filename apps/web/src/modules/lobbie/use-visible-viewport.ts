import { onBeforeUnmount, type Ref, readonly, ref, watch } from 'vue'

export type VisibleViewport = { height: number; keyboardInset: number }

// iOS Safari keeps the layout viewport full height under the keyboard, so follow the visual viewport.
export const useVisibleViewport = (
  active: Readonly<Ref<boolean>>,
): Readonly<Ref<VisibleViewport | null>> => {
  const visible = ref<VisibleViewport | null>(null)
  const viewport = typeof window === 'undefined' ? undefined : (window.visualViewport ?? undefined)
  if (!viewport) return readonly(visible)

  const update = () => {
    visible.value = {
      height: viewport.height,
      keyboardInset: Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop),
    }
  }
  const stop = () => {
    viewport.removeEventListener('resize', update)
    viewport.removeEventListener('scroll', update)
    visible.value = null
  }

  watch(
    active,
    (on) => {
      if (!on) return stop()
      update()
      viewport.addEventListener('resize', update)
      viewport.addEventListener('scroll', update)
    },
    { immediate: true },
  )
  onBeforeUnmount(stop)
  return readonly(visible)
}
