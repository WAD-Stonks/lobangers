import type { ShellIconName } from '@web/modules/map-shell/ShellIcon.vue'

export type BenefitIcon = ShellIconName | 'share' | 'clock' | 'people'

export interface PromptBenefit {
  readonly icon: BenefitIcon
  readonly title: string
  readonly text: string
}

export interface PromptContent {
  readonly illustration: 'bookmark' | 'arrow'
  readonly heading: string
  readonly intro: string
  readonly benefits: readonly PromptBenefit[]
}

const SAVED: PromptContent = {
  illustration: 'bookmark',
  heading: 'Save your favourite deals',
  intro:
    'Create a free account to save deals, keep track of expiries, and join a community of food lovers.',
  benefits: [
    {
      icon: 'bookmark',
      title: 'Save deals you love',
      text: 'Keep your favourite food deals all in one place.',
    },
    {
      icon: 'clock',
      title: 'Track expiries',
      text: 'Keep expiry dates in view so you never miss a great deal.',
    },
    {
      icon: 'people',
      title: 'Join the community',
      text: 'Share and discover deals with fellow foodies.',
    },
  ],
}

const SHARE: PromptContent = {
  illustration: 'arrow',
  heading: 'Share good lobangs',
  intro:
    'Create a free account to share deals, send favourites to friends, and help more food lovers discover great finds.',
  benefits: [
    {
      icon: 'share',
      title: 'Share with friends',
      text: 'Send great food deals to the people you know.',
    },
    {
      icon: 'edit',
      title: 'Post your finds',
      text: 'Share hidden gems, promos, and stall deals you discover.',
    },
    {
      icon: 'people',
      title: 'Help the community',
      text: 'Let more foodies discover good lobangs near them.',
    },
  ],
}

const SQUAD: PromptContent = {
  illustration: 'arrow',
  heading: 'Eat together in a Squad',
  intro:
    'Create a free account to start a Squad room, invite your friends, and pick a deal together.',
  benefits: [
    {
      icon: 'ticket',
      title: 'Pick a few deals',
      text: 'Shortlist the deals your group might like.',
    },
    {
      icon: 'people',
      title: 'Invite your friends',
      text: 'Share a 4-letter code or an invite link.',
    },
    {
      icon: 'check',
      title: 'Vote together',
      text: 'Everyone votes yay or nah until the group agrees.',
    },
  ],
}

const ACCOUNT: PromptContent = {
  illustration: 'bookmark',
  heading: 'Make every deal count',
  intro: 'Create a free account to save deals, share your finds, and plan meals with friends.',
  benefits: [
    {
      icon: 'bookmark',
      title: 'Save deals you love',
      text: 'Keep your favourite food deals all in one place.',
    },
    {
      icon: 'edit',
      title: 'Post your finds',
      text: 'Share hidden gems, promos, and stall deals you discover.',
    },
    {
      icon: 'people',
      title: 'Eat with friends',
      text: 'Start a Squad room and pick a deal together.',
    },
  ],
}

const BY_TAB: Readonly<Record<string, PromptContent>> = {
  saved: SAVED,
  'submit-deal': SHARE,
  'squad-new': SQUAD,
}

export const promptContent = (tab: unknown): PromptContent =>
  (typeof tab === 'string' && BY_TAB[tab]) || ACCOUNT
