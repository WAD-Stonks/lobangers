import { PRESENCE_AVATARS, type PresenceAvatar } from '@broke-oclock/contracts/presence'

// The six front-view lobangers in /public/lobangers, each with an idle and a "poked" pose.
export const AVATAR_NAMES: Readonly<Record<PresenceAvatar, string>> = {
  bao: 'Bao',
  chickenrice: 'Chicken rice',
  kaya: 'Kaya toast',
  kopi: 'Kopi',
  ondeh: 'Ondeh-ondeh',
  teh: 'Teh',
}

export const AVATARS: readonly PresenceAvatar[] = PRESENCE_AVATARS

export const avatarSrc = (avatar: PresenceAvatar, pose: 'idle' | 'poked' = 'idle'): string =>
  `/lobangers/${avatar}-${pose}.webp`

export const PERSON_LABEL = 'Another lobanger'
export const SELF_LABEL = 'You'
