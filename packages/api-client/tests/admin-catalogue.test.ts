import { createAdminCatalogueClient } from '@api-client/admin-catalogue'
import axios from 'axios'
import { expect, it, vi } from 'vitest'

const id = '0123456789abcdef01234567'
it('validates before HTTP and emits exact versioned paths/bodies', async () => {
  const http = axios.create()
  const patch = vi.spyOn(http, 'patch').mockResolvedValue({ data: { id, version: 8 } })
  const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { id, version: 8 } })
  const client = createAdminCatalogueClient(http)
  const body = {
    expectedVersion: 7,
    note: 'Reviewed correction',
    confirmed: true as const,
    name: 'Canonical name',
  }
  expect(await client.patchMerchant(id, body)).toEqual({ id, version: 8 })
  expect(patch).toHaveBeenCalledWith(`/admin/catalogue/merchants/${id}`, body)
  await client.archiveVenue(id, { expectedVersion: 7, note: 'Reviewed archive', confirmed: true })
  expect(post).toHaveBeenCalledWith(`/admin/catalogue/venues/${id}/archive`, {
    expectedVersion: 7,
    note: 'Reviewed archive',
    confirmed: true,
  })
  expect(() => client.patchMerchant('not-an-id', body)).toThrow('Invalid request')
  expect(() =>
    client.patchMerchant(id, { ...body, subjectHash: 'injected' } as typeof body),
  ).toThrow('Invalid request')
  expect(patch).toHaveBeenCalledTimes(1)
})
it('rejects malformed successful response instead of treating writes as confirmed', async () => {
  const http = axios.create()
  vi.spyOn(http, 'post').mockResolvedValue({ data: { id, state: 'VERIFIED' } })
  await expect(
    createAdminCatalogueClient(http).createMerchant({
      name: 'Canonical',
      note: 'Reviewed',
      confirmed: true,
    }),
  ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
})
