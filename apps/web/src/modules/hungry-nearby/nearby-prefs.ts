import { type PresenceAvatar, presenceAvatarSchema } from '@broke-oclock/contracts/presence'

export type NearbyPrefs = {
  readonly looking: boolean
  readonly sharing: boolean
  readonly avatar: PresenceAvatar | null
  readonly asked: boolean
}

export const NEARBY_PREFS_KEY = 'lobangers-nearby'
export const DEFAULT_PREFS: NearbyPrefs = {
  looking: true,
  sharing: false,
  avatar: null,
  asked: false,
}

type AskState = {
  readonly signedIn: boolean
  readonly located: boolean
  readonly looking: boolean
  readonly sharing: boolean
  readonly asked: boolean
}

export const shouldAskToShare = (state: AskState): boolean =>
  state.signedIn && state.located && state.looking && !state.sharing && !state.asked

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export const parsePrefs = (raw: string | null): NearbyPrefs => {
  if (!raw) return DEFAULT_PREFS
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return DEFAULT_PREFS
    const record = value as Record<string, unknown>
    const avatar = presenceAvatarSchema.safeParse(record.avatar)
    const looking = typeof record.looking === 'boolean' ? record.looking : DEFAULT_PREFS.looking
    return {
      looking,
      sharing: looking && record.sharing === true,
      avatar: avatar.success ? avatar.data : null,
      asked: record.asked === true,
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
    console.warn('Could not remember the Lobangers nearby choice', error)
  }
}
