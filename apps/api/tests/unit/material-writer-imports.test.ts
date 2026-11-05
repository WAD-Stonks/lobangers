import { describe, expect, it, vi } from 'vitest'

vi.mock('@broke-oclock/db', () => {
  throw new Error('Ambient database import forbidden in callable writer tests')
})

describe('operator material writers are import safe', () => {
  it('imports the copy writer without loading the ambient database or dispatching main', async () => {
    await expect(import('@api/tools/rewrite-deal-copy')).resolves.toMatchObject({
      rewriteDealCopy: expect.any(Function),
    })
  })

  it('imports the category writer without loading the ambient database or dispatching main', async () => {
    await expect(import('@api/tools/reclassify-categories')).resolves.toMatchObject({
      reclassifyCategories: expect.any(Function),
    })
  })
})
