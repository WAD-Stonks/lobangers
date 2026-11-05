import { readonly, shallowRef } from 'vue'

export type ConfirmTone = 'danger' | 'primary'

export type ConfirmRequest = {
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
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
      settle(false)
      current.value = { ...request, resolve }
    }),
  confirm: () => settle(true),
  cancel: () => settle(false),
})
