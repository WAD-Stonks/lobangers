import { createServer } from 'node:net'

// Vite interprets port:0 as its default, so reserve an actual loopback port first.
// strictPort must remain enabled on the fixture listener that subsequently uses it.
export const allocateTestPort = async (): Promise<number> => {
  const reservation = createServer()
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = reservation.address()
    if (!address || typeof address === 'string') throw new Error('Missing test listener address')
    return address.port
  } finally {
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    )
  }
}
