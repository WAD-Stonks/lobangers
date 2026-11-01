import {
  createMapPreferences,
  MAP_SIDEBAR_STORAGE_KEY,
} from '@web/modules/map-shell/map-preferences'
import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'

describe('map preferences', () => {
  it('restores and saves the sidebar choice without persisting tutorial progress', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    const scope = effectScope()
    scope.run(() => {
      const preferences = createMapPreferences(storage)
      expect(preferences.sidebarVisible.value).toBe(true)
      preferences.sidebarVisible.value = false
      preferences.startTutorial()
      const restored = createMapPreferences(storage)
      expect(restored.sidebarVisible.value).toBe(false)
      expect(restored.tutorialStep.value).toBeNull()
      restored.sidebarVisible.value = true
      expect(values.get(MAP_SIDEBAR_STORAGE_KEY)).toBe('1')
      expect(values.size).toBe(1)
    })
    scope.stop()
  })

  it('still works when browser storage is unavailable', () => {
    const scope = effectScope()
    scope.run(() => {
      const preferences = createMapPreferences({
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      })
      expect(preferences.sidebarVisible.value).toBe(true)
      expect(() => {
        preferences.sidebarVisible.value = false
      }).not.toThrow()
      preferences.startTutorial()
      expect(preferences.tutorialStep.value).toBe(0)
    })
    scope.stop()
  })
})
