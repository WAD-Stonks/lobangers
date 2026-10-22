import { describe, expect, it, vi } from 'vitest'

// Importing a callable writer must not construct the ambient database or run its CLI.
// Throw before construction: even a regression cannot access an external datasource.
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
