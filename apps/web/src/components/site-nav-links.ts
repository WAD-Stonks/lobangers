export type SiteNavLink = Readonly<{ label: string; to: string }>

export const SITE_MENU_ID = 'site-menu'

export const SITE_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Map', to: '/' },
  { label: 'All deals as a list', to: '/?view=list' },
  { label: 'Getting started', to: '/getting-started' },
  { label: 'Admin overview', to: '/admin' },
  { label: 'Platform admin', to: '/admin/accounts' },
  { label: 'Ingestion admin', to: '/admin/ingestion' },
])

// Extra rows for a signed-in visitor, shown in the map shell's brand menu.
export const ACCOUNT_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Saved deals', to: '/saved' },
  { label: 'My submissions', to: '/me/submissions' },
  { label: 'For merchants', to: '/me/merchant-access' },
])
