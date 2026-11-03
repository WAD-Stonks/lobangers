import {
  ACCOUNT_NAV_LINKS,
  SITE_NAV_LINKS,
  type SiteNavLink,
  showsFor,
} from '@web/components/site-nav-links'
import { authClient } from '@web/lib/auth-client'
import { useFlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import type { ShellIconName } from '@web/modules/map-shell/ShellIcon.vue'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

// The site menu's rows, shared by the brand menu (desktop) and the Account page's More tab
// (wherever a bottom nav replaces the menu).
export type MenuGroup = Readonly<{ label: string; links: readonly SiteNavLink[] }>

export const MENU_LINK_ICONS: Readonly<Record<string, ShellIconName>> = {
  '/about': 'help',
  '/browse': 'map',
  '/deals': 'ticket',
  '/saved': 'bookmark',
  '/me/submissions': 'edit',
  '/me/merchant-access': 'store',
  '/merchant': 'store',
  '/admin': 'filters',
  '/admin/accounts': 'user',
  '/admin/ingestion': 'list',
}

export const useMenuLinks = () => {
  const session = authClient.useSession()
  const flash = useFlashDrops()
  const toast = useToast()
  const router = useRouter()

  const user = computed(() => session.value.data?.user ?? null)
  // Flash Drop codes still good to use; the menu button wears a dot so they are never lost.
  const activeCodeCount = computed(() => (user.value ? (flash?.activeCodes.value.length ?? 0) : 0))
  const codesText = computed(() => {
    const count = activeCodeCount.value
    if (count === 0) return 'Codes you claim from Flash Drops'
    return `${count} ${count === 1 ? 'code' : 'codes'} ready to use`
  })

  // Role-limited rows (administration) only show for that role, as in the site header.
  const visibleSiteLinks = computed(() =>
    SITE_NAV_LINKS.filter((link) => showsFor(link, user.value?.role)),
  )
  const accountLinks = computed(() =>
    user.value ? ACCOUNT_NAV_LINKS.filter((link) => showsFor(link, user.value?.role)) : [],
  )
  const menuGroups = computed<readonly MenuGroup[]>(() =>
    [
      {
        label: 'Your activity',
        links: accountLinks.value.filter((link) => link.to !== '/me/merchant-access'),
      },
      {
        label: 'Explore',
        // All deals first, then the map.
        links: ['/deals', '/browse'].flatMap((to) =>
          visibleSiteLinks.value.filter((link) => link.to === to),
        ),
      },
      {
        label: 'Contribute',
        links: accountLinks.value.filter((link) => link.to === '/me/merchant-access'),
      },
      { label: 'About', links: [{ label: 'About Lobangers', to: '/about' }] },
      { label: 'Administration', links: visibleSiteLinks.value.filter((link) => link.roles) },
    ].filter((group) => group.links.length > 0 || group.label === 'Contribute'),
  )

  const logOut = async () => {
    try {
      await authClient.signOut()
      toast.show('Logged out. Your saved deals are safe.')
      await router.push({ name: 'landing' })
    } catch (error) {
      console.error('Sign out failed', error)
      toast.show('Could not log out. Please try again.', { tone: 'error' })
    }
  }

  return { user, activeCodeCount, codesText, menuGroups, logOut }
}
