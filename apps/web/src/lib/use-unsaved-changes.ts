import { useConfirm } from '@web/lib/use-confirm'
import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export const UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes. Leave and discard them?'

// Asks before a dirty form is lost to a route change or a tab close/reload.
// `confirmDiscard` is also returned for in-page Cancel buttons. A tab close can only use the
// browser's own leave-page prompt, so beforeunload stays native.
export const useUnsavedChanges = (isDirty: Ref<boolean>) => {
  const { ask } = useConfirm()
  const confirmDiscard = async (): Promise<boolean> =>
    !isDirty.value ||
    ask({
      title: 'Discard changes?',
      body: UNSAVED_CHANGES_MESSAGE,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    })

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty.value) return
    event.preventDefault()
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
  onBeforeRouteLeave(() => confirmDiscard())

  return { confirmDiscard }
}
