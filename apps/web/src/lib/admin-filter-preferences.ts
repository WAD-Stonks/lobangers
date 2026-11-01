import { onAdminIdentityEnd } from '@web/lib/admin-recovery'

// Presentation-only, in-memory preferences. Never persist searches, identities,
// record details, cursors or mutation consent in browser storage.
const preferences = new Map<string, Record<string, string | boolean>>()
let generation = 0
onAdminIdentityEnd(() => {
  generation++
  preferences.clear()
})

export const rememberAdminFilters = <T extends Record<string, string | boolean>>(
  domain: 'accounts' | 'deals',
  defaults: T,
) => {
  const ownerGeneration = generation
  const current = () => ownerGeneration === generation
  const copy = (values: T) =>
    Object.fromEntries(Object.keys(defaults).map((key) => [key, values[key] ?? defaults[key]])) as T
  return {
    read: (): T =>
      current() ? copy((preferences.get(domain) as T | undefined) ?? defaults) : copy(defaults),
    save: (values: T) => {
      if (current()) preferences.set(domain, copy(values))
    },
    clear: () => {
      if (current()) preferences.delete(domain)
    },
  }
}
