import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export const UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes. Leave and discard them?'

// Asks before a dirty form is lost to a route change or a tab close/reload.
// `confirmDiscard` is also returned for in-page Cancel buttons.
export const useUnsavedChanges = (isDirty: Ref<boolean>) => {
  const confirmDiscard = (): boolean => !isDirty.value || window.confirm(UNSAVED_CHANGES_MESSAGE)

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty.value) return
    event.preventDefault()
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
  onBeforeRouteLeave(() => confirmDiscard())

  return { confirmDiscard }
}
