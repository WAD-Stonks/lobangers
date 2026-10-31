import { useGeolocation } from '@web/modules/browse-map/use-geolocation'
import { describe, expect, it } from 'vitest'

// Synthetic browser geolocation: each fake answers getCurrentPosition the way a test needs.
const fakeGeolocation = (
  behave: (ok: PositionCallback, fail: PositionErrorCallback) => void,
): Geolocation =>
  ({
    getCurrentPosition: (ok: PositionCallback, fail?: PositionErrorCallback | null) =>
      behave(ok, fail ?? (() => {})),
  }) as unknown as Geolocation

describe('useGeolocation', () => {
  it('reports granted with the browser position and accuracy', async () => {
    const geo = fakeGeolocation((ok) =>
      ok({
        coords: { latitude: 1.3, longitude: 103.8, accuracy: 25 },
      } as GeolocationPosition),
    )
    const { status, position, accuracyMetres, locate } = useGeolocation(geo)

    await expect(locate()).resolves.toEqual({ lat: 1.3, lng: 103.8 })
    expect(status.value).toBe('granted')
    expect(position.value).toEqual({ lat: 1.3, lng: 103.8 })
    expect(accuracyMetres.value).toBe(25)
  })

  it('reports denied without a position when permission is refused', async () => {
    const geo = fakeGeolocation((_ok, fail) =>
      fail({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    const { status, position, accuracyMetres, locate } = useGeolocation(geo)

    await expect(locate()).resolves.toBeNull()
    expect(status.value).toBe('denied')
    expect(position.value).toBeNull()
    expect(accuracyMetres.value).toBeNull()
  })

  it('reports unavailable for other failures and for missing geolocation support', async () => {
    const failing = useGeolocation(
      fakeGeolocation((_ok, fail) =>
        fail({ code: 2, message: 'unavailable' } as GeolocationPositionError),
      ),
    )
    await expect(failing.locate()).resolves.toBeNull()
    expect(failing.status.value).toBe('unavailable')

    const missing = useGeolocation(undefined)
    await expect(missing.locate()).resolves.toBeNull()
    expect(missing.status.value).toBe('unavailable')
  })
})
