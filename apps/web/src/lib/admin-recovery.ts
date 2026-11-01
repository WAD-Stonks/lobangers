import { shallowReactive } from 'vue'

// Memory-only UX ownership. Native IDs are hints, never server authorization.
// This owner survives SPA disposal. It never receives credentials or protected DTOs.
type NativeIdentity = { user: { id: string }; session: { id: string } }
export type AdminAttempt = {
  version: number
  operationVersion?: number
  unknown: boolean
  pending: boolean
  creation?: boolean
  receipt?: { observed: number; id: string; version: number; operationVersion?: number }
}
type Domain = 'catalogue' | 'deals' | 'moderation'
type Owner = {
  principal: string
  session: string
  active: boolean
  ledgers: Map<Domain, Map<string, AdminAttempt>>
}
let owner: Owner | null = null
let observation = 0
const endings = new Set<() => void>()
export const onAdminIdentityEnd = (close: () => void) => {
  endings.add(close)
  return () => {
    endings.delete(close)
  }
}
const retire = () => {
  if (owner) {
    owner.active = false
    for (const attempts of owner.ledgers.values()) attempts.clear()
    owner.ledgers.clear()
  }
  // Close and fence every mounted consumer BEFORE exposing a replacement.
  for (const close of endings) close()
  owner = null
}
export const confirmAdminIdentity = (identity: NativeIdentity | null) => {
  if (!identity) {
    retire()
    return
  }
  const principal = identity.user.id,
    session = identity.session?.id
  if (!principal || !session) throw new Error('Native identity is incomplete')
  if (owner?.principal === principal && owner.session === session) return
  if (owner) retire()
  owner = { principal, session, active: true, ledgers: new Map() }
}

// Capture an exact owner, never read a new owner's ledger from a late callback.
export const adminRecovery = (domain: Domain) => {
  const scope = owner
  let attempts = scope?.ledgers.get(domain)
  if (!attempts) {
    attempts = shallowReactive(new Map<string, AdminAttempt>())
    scope?.ledgers.set(domain, attempts)
  }
  const ledger = attempts
  const current = () => !scope || (scope.active && owner === scope)
  return {
    attempts: ledger,
    observe: () => ++observation,
    current,
    settle: (key: string, attempt: AdminAttempt, result: AdminAttempt | null) => {
      if (!current() || ledger.get(key) !== attempt) return
      if (result) ledger.set(key, result)
      else ledger.delete(key)
    },
    // Standalone panels without a confirmed native owner are presentation-local.
    close: () => {
      if (!scope) ledger.clear()
    },
  }
}
