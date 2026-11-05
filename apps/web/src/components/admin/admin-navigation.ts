import { ref } from 'vue'

export const sidebarCollapsed = ref(false)
export const adminNavigation = [
  { href: '/admin', label: 'Overview', icon: 'overview', group: 'Workspace' },
  { href: '/admin/deals', label: 'Deals', icon: 'deals', group: 'Content' },
  { href: '/admin/flash-drops', label: 'Flash drops', icon: 'flash', group: 'Content' },
  { href: '/admin/catalogue', label: 'Merchants', icon: 'catalogue', group: 'Content' },
  { href: '/admin/moderation', label: 'Moderation', icon: 'moderation', group: 'Content' },
  { href: '/admin/accounts', label: 'Accounts', icon: 'accounts', group: 'Access' },
  { href: '/admin/ingestion', label: 'Ingestion', icon: 'ingestion', group: 'Operations' },
  { href: '/admin/audit', label: 'Audit', icon: 'audit', group: 'Operations' },
] as const
