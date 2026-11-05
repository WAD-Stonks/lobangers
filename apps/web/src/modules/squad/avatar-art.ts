import { SQUAD_AVATARS, type SquadAvatar } from '@broke-oclock/contracts/squad'

export const AVATAR_NAMES: Record<SquadAvatar, string> = {
  kopi: 'Kopi',
  teh: 'Teh',
  bao: 'Bao',
  kaya: 'Kaya',
  ondeh: 'Ondeh',
  chickenrice: 'Chicken rice',
}

export const avatarUrl = (avatar: SquadAvatar, mood: 'idle' | 'poked' = 'idle') =>
  `/lobangers/${avatar}-${mood}.webp`

export const THUMBS_UP_URL = '/lobangers/thumbs-up.webp'
export const THUMBS_DOWN_URL = '/lobangers/thumbs-down.webp'

export const randomAvatar = (random: () => number = Math.random): SquadAvatar =>
  SQUAD_AVATARS[Math.floor(random() * SQUAD_AVATARS.length)] ?? 'kopi'
