import type { FlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import { type Ref, watch } from 'vue'

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
