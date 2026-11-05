import { type Ref, type WatchSource, watch } from 'vue'

export const usePanelScrollReset = (el: Ref<HTMLElement | null>, sources: WatchSource[]) => {
  watch(
    sources,
    () => {
      if (el.value) el.value.scrollTop = 0
    },
    { flush: 'post' },
  )
}
