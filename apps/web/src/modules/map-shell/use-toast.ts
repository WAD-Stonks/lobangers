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
export type Toast = { readonly id: number; readonly text: string; readonly tone: ToastTone }
export type ToastOptions = { readonly tone?: ToastTone }

export type ToastQueue = {
  readonly current: Readonly<Ref<Toast | null>>
  readonly show: (text: string, options?: ToastOptions) => void
  readonly dismiss: () => void
  readonly dispose: () => void
}

// One toast at a time: a new one replaces the current toast and restarts the timer.
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
    current.value = { id: nextId++, text, tone: options.tone ?? 'info' }
    timer = setTimeout(dismiss, TOAST_MS)
  }

  return { current: readonly(current), show, dismiss, dispose: clear }
}

const TOAST_KEY: InjectionKey<ToastQueue> = Symbol('toast-queue')

// Creates the shell's queue, shares it with every panel and clears its timer on unmount.
export const provideToastQueue = (): ToastQueue => {
  const queue = createToastQueue()
  provide(TOAST_KEY, queue)
  onBeforeUnmount(queue.dispose)
  return queue
}

// Outside the shell (a panel mounted alone in a test) toasts go nowhere rather than throwing.
const SILENT_QUEUE: ToastQueue = {
  current: readonly(shallowRef(null)),
  show: () => undefined,
  dismiss: () => undefined,
  dispose: () => undefined,
}

export const useToast = (): ToastQueue => inject(TOAST_KEY, SILENT_QUEUE)
