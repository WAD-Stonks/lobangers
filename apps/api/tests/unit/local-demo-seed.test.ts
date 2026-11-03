import type { Database } from '@api/modules/platform-admin/transaction'
import {
  assertDistinctDemoRoles,
  assertSeedTarget,
  seedLocalDemo,
} from '@api/tools/seed-local-demo'
import { describe, expect, it, vi } from 'vitest'

describe('local demo seed safety', () => {
  it.each([
    { admins: ['demo@example.test'], merchants: ['demo@example.test'] },
    { admins: [' Admin@Example.Test '], merchants: ['admin@example.test'] },
    {
      admins: ['one@example.test', 'two@example.test'],
      merchants: ['merchant@example.test', ' TWO@EXAMPLE.TEST '],
    },
  ])('rejects overlapping roles before accessing the database: %j', async (options) => {
    const accessDatabase = vi.fn(() => {
      throw new Error('The database must not be accessed for invalid role assignments')
    })
    const database = new Proxy({} as Database, { get: accessDatabase })

    await expect(seedLocalDemo(database, { ...options, shared: false })).rejects.toThrow(
      'Use distinct accounts for --admin and --merchant',
    )
    expect(accessDatabase).not.toHaveBeenCalled()
  })

  it('accepts separate role accounts and optional role flags', () => {
    expect(() =>
      assertDistinctDemoRoles(['admin@example.test'], ['merchant@example.test']),
    ).not.toThrow()
    expect(() => assertDistinctDemoRoles([], ['merchant@example.test'])).not.toThrow()
    expect(() => assertDistinctDemoRoles(['admin@example.test'], [])).not.toThrow()
  })

  it('continues to require explicit permission for a nonlocal database', () => {
    expect(() => assertSeedTarget(undefined, false)).toThrow('Set DATABASE_URL first')
    expect(() =>
      assertSeedTarget('mongodb://127.0.0.1:27017/demo?replicaSet=rs0', false),
    ).not.toThrow()
    expect(() => assertSeedTarget('mongodb+srv://example.test/demo', false)).toThrow(
      'Refusing to seed a database that is not on this machine',
    )
    expect(() => assertSeedTarget('mongodb+srv://example.test/demo', true)).not.toThrow()
  })
})
