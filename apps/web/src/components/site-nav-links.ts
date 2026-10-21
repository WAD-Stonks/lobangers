export type SiteNavLink = Readonly<{ label: string; to: string; roles?: readonly string[] }>

export const SITE_MENU_ID = 'site-menu'

export const SITE_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Home', to: '/' },
  { label: 'Map', to: '/browse' },
  { label: 'All deals', to: '/deals' },
  { label: 'Share a deal', to: '/submit-deal' },
  { label: 'Getting started', to: '/getting-started' },
  { label: 'Admin overview', to: '/admin', roles: ['ADMIN'] },
  { label: 'Platform admin', to: '/admin/accounts', roles: ['ADMIN'] },
  { label: 'Ingestion admin', to: '/admin/ingestion', roles: ['ADMIN'] },
])

// Extra rows for a signed-in visitor, shown in the map shell's brand menu.
export const ACCOUNT_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Saved deals', to: '/saved' },
  { label: 'My submissions', to: '/me/submissions' },
  { label: 'For merchants', to: '/me/merchant-access' },
])
