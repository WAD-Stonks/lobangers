import { computed, ref, watch } from 'vue'

export type Theme = 'light' | 'dark'
export const THEME_STORAGE_KEY = 'lobangers.theme'

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

const readStoredTheme = (storage: ThemeStorage | undefined): Theme | null => {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export const resolveInitialTheme = (
  storage: ThemeStorage | undefined,
  prefersDark: boolean,
): Theme => readStoredTheme(storage) ?? (prefersDark ? 'dark' : 'light')

export const applyTheme = (root: HTMLElement, theme: Theme) => {
  root.dataset.theme = theme
}

export const syncThemeColor = () => {
  if (typeof document === 'undefined') return
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const background = getComputedStyle(document.body).backgroundColor
  if (meta && background) meta.content = background
}

export const createTheme = (options: {
  storage?: ThemeStorage
  prefersDark: boolean
  root?: HTMLElement
}) => {
  const { storage, prefersDark, root } = options
  let chosen = readStoredTheme(storage) !== null
  const theme = ref<Theme>(resolveInitialTheme(storage, prefersDark))
  watch(
    theme,
    (value, previous) => {
      if (!root) return
      const switching = previous !== undefined && typeof requestAnimationFrame === 'function'
      if (switching) root.classList.add('theme-switching')
      applyTheme(root, value)
      syncThemeColor()
      if (switching)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => root.classList.remove('theme-switching')),
        )
    },
    { immediate: true, flush: 'sync' },
  )

  const toggle = () => {
    chosen = true
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      storage?.setItem(THEME_STORAGE_KEY, theme.value)
    } catch {}
  }
  const followSystem = (dark: boolean) => {
    if (!chosen) theme.value = dark ? 'dark' : 'light'
  }
  const followStorage = (value: string | null, systemDark: boolean) => {
    chosen = isTheme(value)
    theme.value = isTheme(value) ? value : systemDark ? 'dark' : 'light'
  }

  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    toggle,
    followSystem,
    followStorage,
  }
}

type ThemeController = ReturnType<typeof createTheme>
let shared: ThemeController | undefined

export const useTheme = (): ThemeController => {
  if (shared) return shared
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  } catch {}
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null
  shared = createTheme({
    storage,
    prefersDark: media?.matches ?? false,
    root: document.documentElement,
  })
  const controller = shared
  media?.addEventListener('change', (event) => controller.followSystem(event.matches))
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null)
      controller.followStorage(event.key === null ? null : event.newValue, media?.matches ?? false)
  })
  return controller
}
