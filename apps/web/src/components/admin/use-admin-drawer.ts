import { onMounted, onUnmounted, ref } from 'vue'

export const useAdminDrawer = () => {
  const mobile = ref(window.innerWidth < 768)
  const dialog = ref<HTMLDialogElement | null>(null)
  const toggleButton = ref<HTMLButtonElement | null>(null)
  const drawerOpen = ref(false)
  let priorOverflow = ''
  const closeDrawer = (restoreFocus = true) => {
    if (!drawerOpen.value) return
    drawerOpen.value = false
    dialog.value?.close()
    document.body.style.overflow = priorOverflow
    if (restoreFocus) toggleButton.value?.focus()
  }
  const openDrawer = () => {
    if (!mobile.value || !dialog.value || drawerOpen.value) return
    priorOverflow = document.body.style.overflow
    drawerOpen.value = true
    document.body.style.overflow = 'hidden'
    dialog.value.showModal()
    dialog.value.querySelector<HTMLButtonElement>('button')?.focus()
  }
  const drawerKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDrawer()
      return
    }
    if (event.key !== 'Tab') return
    const controls = Array.from(dialog.value?.querySelectorAll<HTMLElement>('*') ?? []).filter(
      (element) => element.matches('a[href]') || element.matches('button:not(:disabled)'),
    )
    const first = controls?.[0]
    const last = controls?.[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  const resize = () => {
    const next = window.innerWidth < 768
    if (mobile.value !== next) closeDrawer()
    mobile.value = next
  }
  onMounted(() => window.addEventListener('resize', resize))
  onUnmounted(() => {
    closeDrawer(false)
    window.removeEventListener('resize', resize)
  })
  return { mobile, dialog, toggleButton, drawerOpen, closeDrawer, openDrawer, drawerKeydown }
}
