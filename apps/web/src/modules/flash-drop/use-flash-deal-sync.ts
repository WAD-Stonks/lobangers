import type { FlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import { type Ref, watch } from 'vue'

// A flash deal is its own deal, published only when it goes live, so it is missing from deals
// loaded before then and opening it would read "Deal not found". When a started flash deal's deal
// is not loaded, the deals are reloaded once for it; one the feed still leaves out (a filter, a
// demo) is not retried, so a drop that never appears cannot cause a reload loop.

type ShellDeals = {
  readonly deals: Readonly<Ref<readonly { readonly id: string }[]>>
  readonly status: Readonly<Ref<string>>
  readonly reload: () => unknown
}

export const watchFlashDeals = (flash: FlashDrops, shell: ShellDeals) => {
  let tried: ReadonlySet<string> = new Set()
  watch(
    () => {
      if (shell.status.value !== 'ready') return []
      const loaded = new Set(shell.deals.value.map((deal) => deal.id))
      return flash.drops.value
        .filter((drop) => Date.parse(drop.startsAt) <= flash.now.value)
        .map((drop) => drop.dealId)
        .filter((dealId) => !loaded.has(dealId) && !tried.has(dealId))
    },
    (missing) => {
      if (missing.length === 0) return
      tried = new Set([...tried, ...missing])
      void shell.reload()
    },
    { immediate: true },
  )
}
