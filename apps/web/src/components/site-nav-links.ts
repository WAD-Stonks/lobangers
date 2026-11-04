export type SiteNavLink = Readonly<{ label: string; to: string; roles?: readonly string[] }>

export const SITE_MENU_ID = 'site-menu'

export const SITE_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Map', to: '/browse' },
  { label: 'All deals', to: '/deals' },
  { label: 'Admin overview', to: '/admin', roles: ['ADMIN'] },
  { label: 'Platform admin', to: '/admin/accounts', roles: ['ADMIN'] },
  { label: 'Ingestion admin', to: '/admin/ingestion', roles: ['ADMIN'] },
])

// Extra rows for a signed-in visitor, shown in the map shell's brand menu. Merchants manage
// their outlets from the dashboard, so only regular users are offered merchant access.
export const ACCOUNT_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Saved deals', to: '/saved' },
  { label: 'My deal submissions', to: '/me/submissions' },
  { label: 'Merchant dashboard', to: '/merchant', roles: ['MERCHANT'] },
  { label: 'For merchants', to: '/me/merchant-access', roles: ['USER'] },
])

// Whether a role-limited link shows for this role; links without roles show for everyone.
export const showsFor = (link: SiteNavLink, role: string | null | undefined) =>
  !link.roles || link.roles.includes(role ?? '')
