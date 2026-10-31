import { type Ref, type WatchSource, watch } from 'vue'

// New panel content starts at the top, instantly: the slide-in animation hides the jump. Pass
// only sources that change the content (route params, tab, step, sort, filters), never
// per-item state such as votes or saves.
export const usePanelScrollReset = (el: Ref<HTMLElement | null>, sources: WatchSource[]) => {
  watch(
    sources,
    () => {
      if (el.value) el.value.scrollTop = 0
    },
    { flush: 'post' },
  )
}
