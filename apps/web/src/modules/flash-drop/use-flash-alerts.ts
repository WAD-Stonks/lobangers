import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { offerTitle } from '@web/modules/flash-drop/flash-format'
import type { FlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import type { ToastQueue } from '@web/modules/map-shell/use-toast'
import { watch } from 'vue'

// Tells everyone with the site open when a flash deal goes live: one toast per flash deal, with
// a button that opens it on the map. Live flash deals already refresh every 30 s, so a new one is
// announced within about half a minute of starting. Each browser remembers which flash deals it
// has announced, so a reload or a second tab does not repeat them.

const STORAGE_KEY = 'lobangers:flash-alerts'
// Plenty for a few days of flash deals; the oldest are forgotten first.
const REMEMBERED = 100

// Storage can be missing or blocked (private windows, tests), so every access is guarded and the
// alerts still work for this page without it.
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
  } catch {
    // Not remembered across reloads; still announced once on this page.
  }
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
      // Only flash deals that have started and still have codes; demo ones are left out.
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
      // One toast at a time: announce the newest; the others are on the map with their banners.
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
