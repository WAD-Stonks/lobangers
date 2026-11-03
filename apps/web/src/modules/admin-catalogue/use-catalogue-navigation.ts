import type { CatalogueMerchant } from '@broke-oclock/contracts/admin-catalogue'
import { adminCatalogueHref, adminRecordId, adminReturnTo } from '@web/lib/admin-workflow-links'
import type { useCatalogue } from '@web/modules/admin-catalogue/use-catalogue'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

type CatalogueState = ReturnType<typeof useCatalogue>
type Kind = 'merchants' | 'venues'
type Location = {
  kind: Kind
  status: 'active' | 'archived' | 'all'
  search: string
  merchantId: string | undefined
  recordId: string | undefined
  returnTo: string | undefined
}

export const useCatalogueNavigation = (state: CatalogueState) => {
  const route = inject(routeLocationKey, null)
  const router = inject(routerKey, null)
  const notice = ref('')
  const names = new Map<string, string>()
  let applied: Location | null = null
  let queued: Location | null = null
  let internalPath: string | null = null
  let generation = 0
  let alive = true

  const fromRoute = (): Location => ({
    kind: route?.query.kind === 'venues' ? 'venues' : 'merchants',
    status:
      route?.query.status === 'all' || route?.query.status === 'archived'
        ? route.query.status
        : 'active',
    search:
      typeof route?.query.search === 'string' && route.query.search.length <= 100
        ? route.query.search
        : '',
    merchantId: route?.query.kind === 'venues' ? adminRecordId(route.query.merchantId) : undefined,
    recordId: adminRecordId(route?.query.recordId),
    returnTo: adminReturnTo(route?.query.returnTo),
  })
  const current = (): Location => applied ?? fromRoute()
  const returnTo = computed(() => (route ? adminReturnTo(route.query.returnTo) : applied?.returnTo))
  const merchantName = computed(() => {
    const id = state.merchantId.value
    const row = state.selected.value
    if (row?.kind === 'venues' && row.row.merchantId === id) return row.row.merchantName
    const item = state.items.value.find((item) => 'merchantId' in item && item.merchantId === id)
    return (
      names.get(id) ?? (item && 'merchantName' in item ? item.merchantName : 'Selected merchant')
    )
  })
  const locationHref = (location: Location) => {
    const url = new URL(adminCatalogueHref(location), 'http://admin.local')
    if (location.search) url.searchParams.set('search', location.search)
    if (location.status !== 'active') url.searchParams.set('status', location.status)
    return `${url.pathname}${url.search}`
  }
  const apply = async (location: Location, refresh = false) => {
    if (!alive) return
    if (state.pending.value) {
      queued = location
      return
    }
    const ticket = ++generation
    const reload =
      refresh ||
      !applied ||
      ['kind', 'status', 'search', 'merchantId'].some(
        (key) => applied?.[key as keyof Location] !== location[key as keyof Location],
      )
    applied = location
    notice.value = ''
    state.kind.value = location.kind
    state.status.value = location.status
    state.search.value = location.search
    state.merchantId.value = location.merchantId ?? ''
    if (reload) await state.load()
    if (!alive || ticket !== generation || state.pending.value || state.listError.value) return
    if (location.recordId) {
      if (
        state.selected.value?.kind !== location.kind ||
        state.selected.value.row.id !== location.recordId
      )
        await state.select(location.kind, location.recordId)
    } else state.clearSelection()
  }
  const navigate = async (location: Location, replace = false, refresh = false) => {
    if (state.pending.value) return
    const destination = locationHref(location)
    if (router && route && destination !== route.fullPath) {
      internalPath = destination
      try {
        await router[replace ? 'replace' : 'push'](destination)
      } finally {
        internalPath = null
      }
      if (route.fullPath !== destination) return
    }
    await apply(location, refresh)
  }
  const openRecord = (kind: Kind, recordId: string) => navigate({ ...current(), kind, recordId })
  const closeRecord = () => navigate({ ...current(), recordId: undefined })
  const viewOutlets = (merchant: CatalogueMerchant) => {
    if (state.pending.value) return
    names.set(merchant.id, merchant.name)
    return navigate({
      ...current(),
      kind: 'venues',
      merchantId: merchant.id,
      recordId: undefined,
      search: '',
      status: 'all',
    })
  }
  const viewMerchant = () => {
    const id =
      state.merchantId.value ||
      (state.selected.value?.kind === 'venues' ? state.selected.value.row.merchantId : '')
    if (adminRecordId(id))
      return navigate({
        ...current(),
        kind: 'merchants',
        merchantId: undefined,
        recordId: id,
        search: '',
        status: 'all',
      })
  }
  const clearMerchant = () => navigate({ ...current(), merchantId: undefined, recordId: undefined })
  const changeDirectory = () => {
    const selected = state.selected.value
    if (state.kind.value === 'venues' && selected?.kind === 'merchants')
      return viewOutlets(selected.row)
    return navigate({
      ...current(),
      kind: state.kind.value,
      merchantId: undefined,
      recordId: undefined,
      search: '',
    })
  }
  const applyFilters = () => {
    if (state.merchantId.value.trim() && !adminRecordId(state.merchantId.value.trim())) {
      notice.value = 'Enter a valid merchant ID or clear the merchant filter.'
      return
    }
    return navigate(
      {
        ...current(),
        kind: state.kind.value,
        search: state.search.value.trim(),
        status: state.status.value,
        merchantId:
          state.kind.value === 'venues' ? adminRecordId(state.merchantId.value.trim()) : undefined,
        recordId: undefined,
      },
      false,
      true,
    )
  }
  const loadMore = async () => {
    if (state.pending.value) return
    await closeRecord()
    if (alive && !state.pending.value) await state.load(true)
  }
  const startMerchant = async () => {
    if (state.pending.value) return
    await navigate({ ...current(), kind: 'merchants', merchantId: undefined, recordId: undefined })
    if (alive && !state.pending.value) state.start()
  }
  const write = async (...args: Parameters<CatalogueState['write']>) => {
    const ticket = generation
    await state.write(...args)
    const selected = state.selected.value
    if (
      !alive ||
      ticket !== generation ||
      queued ||
      !selected ||
      state.message.value ||
      state.locked.value
    )
      return
    const merchantId = selected.kind === 'venues' ? selected.row.merchantId : undefined
    if (selected.kind === 'venues') names.set(selected.row.merchantId, selected.row.merchantName)
    await navigate(
      { ...current(), kind: selected.kind, merchantId, recordId: selected.row.id },
      true,
    )
  }
  watch(
    () => [
      route?.query.kind,
      route?.query.status,
      route?.query.search,
      route?.query.merchantId,
      route?.query.recordId,
      route?.query.returnTo,
    ],
    () => {
      if (route?.fullPath === internalPath) return
      void apply(fromRoute())
    },
    { flush: 'sync' },
  )
  watch(state.pending, async (pending) => {
    if (pending || !queued) return
    await nextTick()
    if (!alive || state.pending.value || !queued) return
    const location = queued
    queued = null
    void apply(location)
  })
  onMounted(() => {
    void apply(fromRoute())
  })
  onUnmounted(() => {
    alive = false
    generation++
  })
  return {
    notice,
    returnTo,
    merchantName,
    openRecord,
    closeRecord,
    viewOutlets,
    viewMerchant,
    clearMerchant,
    changeDirectory,
    applyFilters,
    loadMore,
    startMerchant,
    write,
  }
}
