import { applyTheme, createTheme, resolveInitialTheme, THEME_STORAGE_KEY } from '@web/lib/theme'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

const blockedStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('resolveInitialTheme', () => {
  it('follows the system preference until the visitor picks a theme', () => {
    expect(resolveInitialTheme(memoryStorage(), true)).toBe('dark')
    expect(resolveInitialTheme(memoryStorage(), false)).toBe('light')
  })

  it('prefers a saved choice over the system preference', () => {
    expect(resolveInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'light' }), true)).toBe('light')
    expect(resolveInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }), false)).toBe('dark')
  })

  it('ignores unknown saved values and unavailable storage', () => {
    expect(resolveInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' }), true)).toBe('dark')
    expect(resolveInitialTheme(blockedStorage, false)).toBe('light')
    expect(resolveInitialTheme(undefined, true)).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('marks only the theme attribute so CSS can keep the landing page light', () => {
    const root = document.createElement('html')
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.bsTheme).toBeUndefined()
    expect(root.style.colorScheme).toBe('')
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
  })
})

describe('createTheme', () => {
  it('toggles, applies and saves only the explicit choice', async () => {
    const storage = memoryStorage()
    const root = document.createElement('html')
    const scope = effectScope()
    await scope.run(async () => {
      const theme = createTheme({ storage, prefersDark: false, root })
      expect(theme.theme.value).toBe('light')
      expect(theme.isDark.value).toBe(false)
      expect(root.dataset.theme).toBe('light')
      expect(storage.values.size).toBe(0)

      theme.toggle()
      await nextTick()
      expect(theme.isDark.value).toBe(true)
      expect(root.dataset.theme).toBe('dark')
      expect(storage.values.get(THEME_STORAGE_KEY)).toBe('dark')
    })
    scope.stop()
  })

  it('tracks system changes until the visitor chooses', async () => {
    const storage = memoryStorage()
    const root = document.createElement('html')
    const scope = effectScope()
    await scope.run(async () => {
      const theme = createTheme({ storage, prefersDark: false, root })
      theme.followSystem(true)
      await nextTick()
      expect(theme.theme.value).toBe('dark')
      expect(storage.values.size).toBe(0)

      theme.toggle()
      theme.followSystem(true)
      await nextTick()
      expect(theme.theme.value).toBe('light')
    })
    scope.stop()
  })

  it('keeps the in-memory choice when storage is blocked', async () => {
    const root = document.createElement('html')
    const scope = effectScope()
    await scope.run(async () => {
      const theme = createTheme({ storage: blockedStorage, prefersDark: false, root })
      theme.toggle()
      await nextTick()
      expect(theme.theme.value).toBe('dark')
      expect(root.dataset.theme).toBe('dark')
    })
    scope.stop()
  })
})

describe('ThemeToggle', () => {
  it('is a labelled switch that flips the shared theme', async () => {
    const { mount } = await import('@vue/test-utils')
    const { useTheme } = await import('@web/lib/theme')
    const { default: ThemeToggle } = await import('@web/components/ThemeToggle.vue')
    const theme = useTheme()
    if (theme.isDark.value) theme.toggle()

    const wrapper = mount(ThemeToggle)
    const button = wrapper.get('button[role="switch"]')
    expect(button.attributes('aria-checked')).toBe('false')
    expect(button.text()).toContain('Dark mode')

    await button.trigger('click')
    expect(button.attributes('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await button.trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
    wrapper.unmount()
  })

  it('keeps an accessible name when the admin sidebar collapses to icons', async () => {
    const { mount } = await import('@vue/test-utils')
    const { default: ThemeToggle } = await import('@web/components/ThemeToggle.vue')
    const wrapper = mount(ThemeToggle, { props: { variant: 'admin', collapsed: true } })
    const button = wrapper.get('button[role="switch"]')
    expect(button.attributes('aria-label')).toBe('Dark mode')
    expect(button.attributes('title')).toBe('Dark mode')
    wrapper.unmount()
  })
})
