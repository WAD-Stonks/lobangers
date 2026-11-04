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

// Asks before a dirty form is lost to a route change or a tab close/reload.
// `confirmDiscard` is also returned for in-page Cancel buttons. A tab close can only use the
// browser's own leave-page prompt, so beforeunload stays native.
//
// Once the person says Discard, the form counts as discarded: leaving can still take a moment
// (the router checks the session first), and pressing Cancel or Back again meanwhile must not
// ask a second time. `discarding` is true from then until the page has gone, so the form can
// show that it is leaving. Only a navigation that is refused outright (not one replaced by a
// newer one) puts the question back.
export const useUnsavedChanges = (isDirty: Ref<boolean>) => {
  const { ask } = useConfirm()
  const router = useRouter()
  const discarding = ref(false)

  const confirmDiscard = async (): Promise<boolean> => {
    if (!isDirty.value || discarding.value) return true
    // Look up the session while the question is open, so leaving afterwards doesn't wait on it.
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

  // A leave that a guard refused (not one superseded by a newer click) keeps the form, so a
  // later leave asks again.
  // (A component shown without a real router, as in some tests, has no navigations to watch.)
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
