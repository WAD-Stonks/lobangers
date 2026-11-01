import { type PresenceAvatar, presenceAvatarSchema } from '@broke-oclock/contracts/presence'

// The viewer's Hungry Nearby choice, remembered on this device only: whether they look at
// others, whether they also show themselves, and the lobanger they picked. Storage can be
// missing or blocked (private mode, tests), so every read and write is guarded.

export type NearbyPrefs = {
  readonly looking: boolean
  readonly sharing: boolean
  readonly avatar: PresenceAvatar | null
}

export const NEARBY_PREFS_KEY = 'lobangers-nearby'
export const DEFAULT_PREFS: NearbyPrefs = { looking: false, sharing: false, avatar: null }

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

// Anything unexpected in storage falls back to the defaults, field by field.
export const parsePrefs = (raw: string | null): NearbyPrefs => {
  if (!raw) return DEFAULT_PREFS
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return DEFAULT_PREFS
    const record = value as Record<string, unknown>
    const avatar = presenceAvatarSchema.safeParse(record.avatar)
    const looking = record.looking === true
    return {
      looking,
      // Showing yourself always means looking too.
      sharing: looking && record.sharing === true,
      avatar: avatar.success ? avatar.data : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export const readPrefs = (): NearbyPrefs => {
  try {
    return parsePrefs(storage()?.getItem(NEARBY_PREFS_KEY) ?? null)
  } catch {
    return DEFAULT_PREFS
  }
}

export const writePrefs = (prefs: NearbyPrefs): void => {
  try {
    storage()?.setItem(NEARBY_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    // Only a convenience: the feature still works for this visit.
    console.warn('Could not remember the Lobangers nearby choice', error)
  }
}
