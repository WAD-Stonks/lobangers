import { routerSession } from '@web/lib/session-cache'
import { useConfirm } from '@web/lib/use-confirm'
import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'
import {
  isNavigationFailure,
  NavigationFailureType,
  onBeforeRouteLeave,
  useRouter,
} from 'vue-router'

export const UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes. Leave and discard them?'

export const useUnsavedChanges = (isDirty: Ref<boolean>) => {
  const { ask } = useConfirm()
  const router = useRouter()
  const discarding = ref(false)

  const confirmDiscard = async (): Promise<boolean> => {
    if (!isDirty.value || discarding.value) return true
    void routerSession.get().catch(() => {})
    const confirmed = await ask({
      title: 'Discard changes?',
      body: UNSAVED_CHANGES_MESSAGE,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    })
    if (confirmed) discarding.value = true
    return confirmed
  }

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty.value || discarding.value) return
    event.preventDefault()
  }

  const stopWatchingFailures =
    typeof router?.afterEach === 'function'
      ? router.afterEach((_to, _from, failure) => {
          if (isNavigationFailure(failure, NavigationFailureType.aborted)) discarding.value = false
        })
      : () => {}

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    stopWatchingFailures()
  })
  onBeforeRouteLeave(() => confirmDiscard())

  return { confirmDiscard, discarding }
}
