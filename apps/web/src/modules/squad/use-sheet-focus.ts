import { trapTabKey } from '@web/lib/form-focus'
import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'

export const useSheetFocus = (options: {
  root: Ref<HTMLElement | null>
  initial: Ref<HTMLElement | null>
  returnTo: () => HTMLElement | null | undefined
  onEscape: () => void
}) => {
  let opener: HTMLElement | null = null

  onMounted(() => {
    const active = document.activeElement
    opener = options.returnTo() ?? (active instanceof HTMLElement ? active : null)
    void nextTick(() => options.initial.value?.focus())
  })

  onBeforeUnmount(() => {
    const target = opener
    void nextTick(() => {
      if (target?.isConnected) target.focus({ preventScroll: true })
    })
  })

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      options.onEscape()
      return
    }
    trapTabKey(event, options.root.value)
  }

  return { onKeydown }
}
