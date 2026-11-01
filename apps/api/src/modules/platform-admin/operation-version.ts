import { DomainError } from '@api/modules/domain-error'
import { adminVersionSchema } from '@broke-oclock/contracts/admin-common'

export type AdminVersionField = 'operationVersion' | 'catalogueVersion' | 'moderationVersion'
type VersionFilter = number | null | { isSet: false }
type LegacyVersionWhere = {
  operationVersion: { OR: { operationVersion: VersionFilter }[] }
  catalogueVersion: { OR: { catalogueVersion: VersionFilter }[] }
  moderationVersion: { OR: { moderationVersion: VersionFilter }[] }
}

export const normalizeVersion = (value: number | null | undefined): number => {
  if (value == null) return 0
  if (!Number.isInteger(value) || value < 0 || value > 2_147_483_647)
    throw new DomainError('BAD_REQUEST', 'Invalid stored operation version')
  return value
}

// Spread into updateMany.where; SET expected + 1, do not increment null/missing.
// Require count === 1 or throw CONFLICT. Authorization, claim, write and audit
// belong in the caller's same transaction. This predicate never acquires a fence.
export const legacyVersionWhere = <Field extends AdminVersionField>(
  field: Field,
  expected: number,
): LegacyVersionWhere[Field] => {
  const result = adminVersionSchema.safeParse(expected)
  if (!result.success) throw new DomainError('BAD_REQUEST', 'Invalid expected operation version')
  const values: VersionFilter[] = expected === 0 ? [0, null, { isSet: false }] : [expected]
  const predicates: LegacyVersionWhere = {
    operationVersion: { OR: values.map((operationVersion) => ({ operationVersion })) },
    catalogueVersion: { OR: values.map((catalogueVersion) => ({ catalogueVersion })) },
    moderationVersion: { OR: values.map((moderationVersion) => ({ moderationVersion })) },
  }
  return predicates[field]
}
