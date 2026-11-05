import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { offerTitle } from '@web/modules/flash-drop/flash-format'
import type { FlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import type { ToastQueue } from '@web/modules/map-shell/use-toast'
import { watch } from 'vue'

const STORAGE_KEY = 'lobangers:flash-alerts'
const REMEMBERED = 100

const readSeen = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
const writeSeen = (ids: readonly string[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-REMEMBERED)))
  } catch {}
}

export const flashAlertText = (drop: PublicFlashDrop) =>
  `⚡ Flash deal live now: ${offerTitle(drop)} at ${drop.venueName}`

export const watchFlashAlerts = (
  flash: FlashDrops,
  toast: ToastQueue,
  open: (drop: PublicFlashDrop) => void,
) => {
  const seen = new Set(readSeen())
  watch(
    flash.drops,
    (drops) => {
      const fresh = drops.filter(
        (drop) =>
          !seen.has(drop.id) &&
          !drop.demo &&
          drop.codesLeft > 0 &&
          Date.parse(drop.startsAt) <= flash.now.value,
      )
      if (fresh.length === 0) return
      for (const drop of fresh) seen.add(drop.id)
      writeSeen([...seen])
      const newest = fresh.reduce((a, b) =>
        Date.parse(b.startsAt) > Date.parse(a.startsAt) ? b : a,
      )
      const others = fresh.length - 1
      const text =
        others > 0 ? `${flashAlertText(newest)} (+${others} more)` : flashAlertText(newest)
      toast.show(text, { action: { label: 'Show me', run: () => open(newest) } })
    },
    { immediate: true },
  )
}
