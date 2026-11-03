import { readonly, shallowRef } from 'vue'

// A themed replacement for window.confirm: ask() opens the app's ConfirmDialog and resolves to
// true when the person confirms, false when they cancel (Cancel, Escape or tapping outside).
// One question at a time; the page mounts a single <ConfirmDialog />.

export type ConfirmTone = 'danger' | 'primary'

export type ConfirmRequest = {
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
  // danger for ending or deleting something; primary for an action like Go live.
  readonly tone?: ConfirmTone
}

type Open = ConfirmRequest & { readonly resolve: (confirmed: boolean) => void }

const current = shallowRef<Open | null>(null)

const settle = (confirmed: boolean) => {
  const open = current.value
  current.value = null
  open?.resolve(confirmed)
}

export const useConfirm = () => ({
  current: readonly(current),
  ask: (request: ConfirmRequest) =>
    new Promise<boolean>((resolve) => {
      // A new question replaces one still open, which counts as cancelled.
      settle(false)
      current.value = { ...request, resolve }
    }),
  confirm: () => settle(true),
  cancel: () => settle(false),
})
