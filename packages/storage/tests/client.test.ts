import { expect, it, vi } from 'vitest'

const { uploadFiles } = vi.hoisted(() => ({ uploadFiles: vi.fn() }))
vi.mock('uploadthing/client', () => ({ genUploader: () => ({ uploadFiles }) }))

it('rejects missing authorized completion without exposing an issued URL', async () => {
  uploadFiles.mockResolvedValue([
    { key: 'synthetic-key', ufsUrl: 'https://synthetic.invalid/photo', serverData: null },
  ])
  const { uploadPhoto } = await import('@broke-oclock/storage/client')
  await expect(
    uploadPhoto(new File(['synthetic'], 'photo.webp', { type: 'image/webp' })),
  ).rejects.toThrow('Upload completion not authorized')
})

it('preserves an authorized SDK completion result', async () => {
  uploadFiles.mockResolvedValue([
    {
      key: 'synthetic-key',
      ufsUrl: 'https://synthetic.invalid/photo',
      serverData: { uploadedBy: 'synthetic-user' },
    },
  ])
  const { uploadPhoto } = await import('@broke-oclock/storage/client')
  await expect(
    uploadPhoto(new File(['synthetic'], 'photo.webp', { type: 'image/webp' })),
  ).resolves.toEqual({
    key: 'synthetic-key',
    url: 'https://synthetic.invalid/photo',
    uploadedBy: 'synthetic-user',
  })
})
