import {
  type InjectionKey,
  inject,
  onBeforeUnmount,
  provide,
  type Ref,
  readonly,
  shallowRef,
} from 'vue'

export const TOAST_MS = 4200

export type ToastTone = 'info' | 'error'
export type ToastAction = { readonly label: string; readonly run: () => void }
export type Toast = {
  readonly id: number
  readonly text: string
  readonly tone: ToastTone
  readonly action?: ToastAction
}
export type ToastOptions = { readonly tone?: ToastTone; readonly action?: ToastAction }

export type ToastQueue = {
  readonly current: Readonly<Ref<Toast | null>>
  readonly show: (text: string, options?: ToastOptions) => void
  readonly dismiss: () => void
  readonly dispose: () => void
}

export const createToastQueue = (): ToastQueue => {
  const current = shallowRef<Toast | null>(null)
  let nextId = 1
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const dismiss = () => {
    clear()
    current.value = null
  }
  const show = (text: string, options: ToastOptions = {}) => {
    clear()
    current.value = {
      id: nextId++,
      text,
      tone: options.tone ?? 'info',
      ...(options.action ? { action: options.action } : {}),
    }
    timer = setTimeout(dismiss, TOAST_MS)
  }

  return { current: readonly(current), show, dismiss, dispose: clear }
}

const TOAST_KEY: InjectionKey<ToastQueue> = Symbol('toast-queue')

export const provideToastQueue = (): ToastQueue => {
  const queue = createToastQueue()
  provide(TOAST_KEY, queue)
  onBeforeUnmount(queue.dispose)
  return queue
}

const SILENT_QUEUE: ToastQueue = {
  current: readonly(shallowRef(null)),
  show: () => undefined,
  dismiss: () => undefined,
  dispose: () => undefined,
}

export const useToast = (): ToastQueue => inject(TOAST_KEY, SILENT_QUEUE)
