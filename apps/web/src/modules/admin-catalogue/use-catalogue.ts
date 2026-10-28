import type { createAdminCatalogueClient } from '@broke-oclock/api-client/admin-catalogue'
import type {
  CatalogueMerchant,
  CatalogueVenue,
  CatalogueVenueDetail,
} from '@broke-oclock/contracts/admin-catalogue'
import * as schemas from '@broke-oclock/contracts/admin-catalogue'
import { type AdminAttempt, adminRecovery, onAdminIdentityEnd } from '@web/lib/admin-recovery'
import { ref, shallowRef } from 'vue'

type Kind = 'merchants' | 'venues'
type Selection =
  | { kind: 'merchants'; row: CatalogueMerchant }
  | { kind: 'venues'; row: CatalogueVenueDetail }
type Client = ReturnType<typeof createAdminCatalogueClient>
export const useCatalogue = (
  client: Client,
  denied: (code: 'UNAUTHORIZED' | 'FORBIDDEN') => void = () => {},
) => {
  const kind = ref<Kind>('merchants')
  const search = ref('')
  const status = ref<'active' | 'archived' | 'all'>('active')
  const merchantId = ref('')
  const items = shallowRef<(CatalogueMerchant | CatalogueVenue)[]>([])
  const selected = shallowRef<Selection | null>(null)
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const detailLoading = ref(false)
  const pending = ref(false)
  const locked = ref(true)
  const message = ref('')
  const listError = ref(false)
  const creating = shallowRef<'merchant' | Readonly<CatalogueMerchant> | null>(null)
  type Attempt = AdminAttempt
  const recovery = adminRecovery('catalogue')
  const locks = recovery.attempts
  let creationName = ''
  const versions = new Map<string, number>()
  const key = (type: Kind, id: string) => `${type}:${id}`
  const createKey = (parent: typeof creating.value) =>
    parent === 'merchant' ? 'create:merchants' : parent ? `create:venues:${parent.id}` : ''
  const explanation = (attempt: Attempt) =>
    attempt.creation
      ? `The creation of ${creationName || 'a target in this context'} ${attempt.unknown ? 'outcome could not be confirmed' : 'context changed'}. Do not replay it or start another form to retry. Inspect the directory and audit history, then open the exact created target to continue maintenance. New creation in this context remains locked until an exact creation receipt and fresh target read are available.`
      : attempt.unknown
        ? 'The outcome could not be confirmed. Writes are locked until newer exact target evidence is read. Reload the target; do not replay the request.'
        : 'This target changed. Writes remain locked until a newer exact target version is read. Reload its detail and review again before writing.'
  let generation = 0
  let listGeneration = 0
  let alive = true
  const clearTarget = () => {
    generation++
    detailLoading.value = false
    selected.value = null
    creating.value = null
    locked.value = true
    message.value = ''
  }
  const close = () => {
    clearTarget()
    listGeneration++
    items.value = []
    nextCursor.value = null
    loading.value = false
    pending.value = false
    recovery.close()
    creationName = ''
    versions.clear()
  }
  const unsubscribe = onAdminIdentityEnd(close)
  const failure = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
      close()
      denied(code)
      return
    }
    locked.value = true
    message.value =
      code === 'CONFLICT'
        ? 'This target changed. Reload its detail and review again before writing.'
        : 'The outcome could not be confirmed. Writes are locked. Reload the target; do not replay the request.'
  }
  const load = async (more = false) => {
    if (!alive || pending.value || (more && (loading.value || !nextCursor.value))) return
    clearTarget()
    const ticket = ++listGeneration
    const query = {
      status: status.value,
      limit: 25,
      ...(search.value.trim() ? { search: search.value.trim() } : {}),
      ...(more && nextCursor.value ? { cursor: nextCursor.value } : {}),
    }
    const previous = more ? items.value : []
    loading.value = true
    listError.value = false
    if (!more) {
      items.value = []
      nextCursor.value = null
    }
    try {
      const page =
        kind.value === 'merchants'
          ? await client.merchants(query)
          : await client.venues({
              ...query,
              ...(merchantId.value ? { merchantId: merchantId.value } : {}),
            })
      if (!alive || !recovery.current() || ticket !== listGeneration) return
      items.value = [...new Map([...previous, ...page.items].map((row) => [row.id, row])).values()]
      nextCursor.value = page.nextCursor
    } catch (error) {
      if (alive && recovery.current() && ticket === listGeneration) {
        listError.value = true
        failure(error)
      }
    } finally {
      if (alive && recovery.current() && ticket === listGeneration) loading.value = false
    }
  }
  const select = async (type: Kind, id: string) => {
    if (!alive || pending.value) return
    clearTarget()
    const ticket = generation
    const read = recovery.observe()
    detailLoading.value = true
    try {
      const selection: Selection =
        type === 'merchants'
          ? { kind: type, row: await client.merchant(id) }
          : { kind: type, row: await client.venue(id) }
      if (!alive || !recovery.current() || ticket !== generation) return
      if (selection.row.id !== id || selection.row.version < (versions.get(key(type, id)) ?? -1)) {
        message.value = 'Older or mismatched target evidence ignored. Reload this exact target.'
        return
      }
      versions.set(key(type, id), selection.row.version)
      const attempt = locks.get(key(type, id))
      if (attempt && !attempt.pending && selection.row.version > attempt.version)
        locks.delete(key(type, id))
      for (const [creationKey, unresolved] of locks) {
        if (
          unresolved.creation &&
          !unresolved.pending &&
          unresolved.receipt?.id === id &&
          unresolved.receipt.observed < read &&
          unresolved.receipt.version === selection.row.version &&
          creationKey.startsWith(`create:${type}`)
        )
          locks.delete(creationKey)
      }
      selected.value = Object.freeze({
        ...selection,
        row: Object.freeze({ ...selection.row }),
      }) as Selection
      locked.value =
        selection.row.archived ||
        (selection.kind === 'venues' && selection.row.parentArchived) ||
        locks.has(key(type, id))
      const remaining = locks.get(key(type, id))
      if (remaining) message.value = explanation(remaining)
    } catch (error) {
      if (alive && recovery.current() && ticket === generation) failure(error)
    } finally {
      if (alive && recovery.current() && ticket === generation) detailLoading.value = false
    }
  }
  const start = (parent?: CatalogueMerchant) => {
    if (pending.value) return
    clearTarget()
    creating.value = parent ? Object.freeze({ ...parent }) : 'merchant'
    const attempt = locks.get(createKey(creating.value))
    locked.value = !!parent?.archived || !!attempt
    if (attempt) message.value = explanation(attempt)
  }
  const write = async (
    operation: 'create' | 'patch' | 'archive' | 'record' | 'withdraw',
    fields: Record<string, unknown>,
  ) => {
    if (!alive || pending.value || locked.value) return
    const target = selected.value
    const creation = creating.value
    if (operation !== 'create' && !target) return
    const attemptKey =
      operation === 'create' ? createKey(creation) : target ? key(target.kind, target.row.id) : ''
    if (!attemptKey) return
    const ticket = generation
    const body = { ...fields, ...(target ? { expectedVersion: target.row.version } : {}) }
    let execute: () => Promise<{ id: string; version: number }>
    const type: Kind = target?.kind ?? (creation === 'merchant' ? 'merchants' : 'venues')
    try {
      if (operation === 'create' && creation === 'merchant') {
        const input = schemas.createCatalogueMerchantSchema.parse(body)
        creationName = input.name
        execute = () => client.createMerchant(input)
      } else if (operation === 'create' && creation && creation !== 'merchant') {
        const input = schemas.createCatalogueVenueSchema.parse({
          ...body,
          merchantId: creation.id,
          expectedMerchantVersion: creation.version,
        })
        creationName = input.name
        execute = () => client.createVenue(input)
      } else if (target?.kind === 'merchants' && operation === 'patch') {
        const input = schemas.patchCatalogueMerchantSchema.parse(body)
        execute = () => client.patchMerchant(target.row.id, input)
      } else if (target?.kind === 'merchants' && operation === 'archive') {
        const input = schemas.catalogueMutationSchema.parse(body)
        execute = () => client.archiveMerchant(target.row.id, input)
      } else if (target?.kind === 'venues' && operation === 'patch') {
        const input = schemas.patchCatalogueVenueSchema.parse(body)
        execute = () => client.patchVenue(target.row.id, input)
      } else if (target?.kind === 'venues' && operation === 'archive') {
        const input = schemas.catalogueMutationSchema.parse(body)
        execute = () => client.archiveVenue(target.row.id, input)
      } else if (target?.kind === 'venues' && operation === 'record') {
        const input = schemas.recordCatalogueEvidenceSchema.parse(body)
        execute = () => client.recordEvidence(target.row.id, input)
      } else if (target?.kind === 'venues' && operation === 'withdraw') {
        const input = schemas.withdrawCatalogueEvidenceSchema.parse(body)
        execute = () => client.withdrawEvidence(target.row.id, input)
      } else return
    } catch {
      message.value =
        'Check required fields, a resolved point, safe URLs, reason and explicit confirmation.'
      return
    }
    const attempt: Attempt = {
      version: target?.row.version ?? (creation && creation !== 'merchant' ? creation.version : 0),
      unknown: true,
      pending: true,
      creation: operation === 'create',
    }
    locks.set(attemptKey, attempt) // Before dispatch: unmount cannot erase an in-flight attempt.
    pending.value = true
    message.value = ''
    try {
      const result = await execute()
      recovery.settle(attemptKey, attempt, {
        ...attempt,
        pending: false,
        unknown: false,
        receipt: { observed: recovery.observe(), id: result.id, version: result.version },
      })
      if (!alive || !recovery.current() || ticket !== generation) return
      pending.value = false
      await select(type, result.id)
      // Keep directory counts/versions from being reused as authority after writes.
      items.value = []
      nextCursor.value = null
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      const unresolved = { ...attempt, pending: false, unknown: code !== 'CONFLICT' }
      recovery.settle(
        attemptKey,
        attempt,
        code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'BAD_REQUEST'
          ? null
          : unresolved,
      )
      if (alive && recovery.current() && ticket === generation) {
        if (code !== 'UNAUTHORIZED' && code !== 'FORBIDDEN') {
          locked.value = true
          message.value = explanation(unresolved)
        } else failure(error)
      }
    } finally {
      if (alive && recovery.current() && ticket === generation) pending.value = false
    }
  }
  const dispose = () => {
    close()
    unsubscribe()
    alive = false
  }
  return {
    kind,
    search,
    status,
    merchantId,
    items,
    selected,
    creating,
    nextCursor,
    loading,
    detailLoading,
    pending,
    locked,
    message,
    listError,
    load,
    select,
    start,
    write,
    close,
    dispose,
  }
}
