import { createHash } from 'node:crypto'
import type { OutletPolicyVenue, OutletScopeDeal } from '@api/modules/deals/outlet-eligibility'
import * as policy from '@api/modules/deals/outlet-eligibility'
import type { OutletScopeConfirmation, OutletVerificationEvidence } from '@broke-oclock/db/client'
import { describe, expect, it } from 'vitest'

const venue = () => ({
  id: '111111111111111111111111',
  merchantId: '222222222222222222222222',
  name: 'SYNTHETIC branch',
  address: 'SYNTHETIC address',
  postalCode: null,
  latitude: 12.3,
  longitude: -45.6,
  catalogueKey: 'synthetic:branch:1',
  geographyPrecision: 'PROPERTY' as const,
  deletedAt: null,
})
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

const deal = (overrides: Partial<OutletScopeDeal> = {}): OutletScopeDeal => ({
  id: '333333333333333333333333',
  merchantId: venue().merchantId,
  applicability: 'SELECTED_OUTLETS',
  contentVersion: 7,
  selectedVenueIds: [venue().id],
  ...overrides,
})

const verifiedVenue = (): OutletPolicyVenue & {
  geographyEvidence: OutletVerificationEvidence
  occupancyEvidence: OutletVerificationEvidence
} => {
  const v = venue()
  const proof = {
    state: 'VERIFIED' as const,
    provider: 'ADMIN' as const,
    reference: 'SYNTHETIC receipt, not a real source',
    sourceUrl: null,
    sourceContentHash: null,
    observedAt: null,
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
  }
  return {
    ...v,
    geographyEvidence: { ...proof, subjectHash: policy.geographySubjectHash(v) },
    occupancyEvidence: { ...proof, subjectHash: policy.occupancySubjectHash(v) },
  }
}

describe('verified geography', () => {
  it('refuses rehashed invalid coordinates or unknown precision without imposing a Singapore boundary', () => {
    expect(policy.hasVerifiedGeography(verifiedVenue())).toBe(true)
    for (const changes of [
      { latitude: Number.NaN },
      { latitude: Infinity },
      { latitude: 91 },
      { longitude: -181 },
      { geographyPrecision: null },
      { geographyPrecision: 'UNKNOWN' as const },
    ]) {
      const v = { ...verifiedVenue(), ...changes }
      v.geographyEvidence = { ...v.geographyEvidence, subjectHash: policy.geographySubjectHash(v) }
      expect(policy.hasVerifiedGeography(v)).toBe(false)
    }
  })

  it('accepts current provider-compatible geography but refuses unknown or incomplete proof', () => {
    const v = verifiedVenue()
    expect(policy.hasVerifiedGeography(v)).toBe(true)
    for (const geographyEvidence of [
      undefined,
      null,
      {},
      { ...v.geographyEvidence, reference: '' },
      { ...v.geographyEvidence, verifiedAt: null },
      { ...v.geographyEvidence, verifiedAt: new Date('invalid') },
      { ...v.geographyEvidence, state: 'LEGACY_RETAINED' },
      { ...v.geographyEvidence, provider: 'DATABASE_SNAPSHOT' },
    ]) {
      expect(policy.hasVerifiedGeography({ ...v, geographyEvidence } as OutletPolicyVenue)).toBe(
        false,
      )
    }
  })
})

describe('verified occupancy and new catalogue selection', () => {
  it('requires independent official or ADMIN occupancy and active state for selection', () => {
    const v = verifiedVenue()
    expect(policy.hasVerifiedOccupancy(v)).toBe(true)
    expect(policy.isSelectableCatalogueVenue(v)).toBe(true)
    for (const provider of ['ONEMAP', 'GOOGLE_PLACES', 'DATABASE_SNAPSHOT'] as const) {
      const invalid = { ...v, occupancyEvidence: { ...v.occupancyEvidence, provider } }
      expect(policy.hasVerifiedOccupancy(invalid)).toBe(false)
      expect(policy.isSelectableCatalogueVenue(invalid)).toBe(false)
    }
    for (const provider of ['OFFICIAL_MERCHANT', 'OFFICIAL_PROPERTY', 'ADMIN'] as const) {
      expect(
        policy.hasVerifiedOccupancy({
          ...v,
          occupancyEvidence: { ...v.occupancyEvidence, provider },
        }),
      ).toBe(true)
    }
    for (const occupancyEvidence of [
      undefined,
      null,
      {},
      { ...v.occupancyEvidence, verifiedAt: null },
      { ...v.occupancyEvidence, state: 'LEGACY_RETAINED' },
      { ...v.occupancyEvidence, reference: '   ' },
    ]) {
      expect(policy.hasVerifiedOccupancy({ ...v, occupancyEvidence } as OutletPolicyVenue)).toBe(
        false,
      )
    }
    expect(
      policy.hasVerifiedOccupancy({
        ...v,
        occupancyEvidence: { ...v.occupancyEvidence, subjectHash: policy.geographySubjectHash(v) },
      }),
    ).toBe(false)
    expect(policy.hasVerifiedOccupancy({ ...v, geographyEvidence: null })).toBe(true)
    expect(policy.isSelectableCatalogueVenue({ ...v, deletedAt: new Date() })).toBe(false)
  })
})

const confirmedDeal = (
  overrides: Partial<OutletScopeDeal> = {},
  basis: OutletScopeConfirmation['basis'] = 'SOURCE_SELECTED',
): OutletScopeDeal & { scopeConfirmation: OutletScopeConfirmation } => {
  const d = deal(overrides)
  return {
    ...d,
    scopeConfirmation: {
      basis,
      contentVersion: d.contentVersion,
      scopeHash: policy.outletScopeHash(d),
      evidenceRef: `SYNTHETIC receipt:campaign:${d.id}`,
      retainedVenueIds: [],
      sourceContentHash: null,
      sourceUrl: null,
      confirmedAt: new Date('2026-01-01T00:00:00Z'),
      reasonCode: null,
    },
  }
}

describe('confirmed campaign scope', () => {
  it('does not invent a confirmation time when an otherwise complete source receipt has an optional unknown timestamp', () => {
    const d = confirmedDeal()
    for (const confirmedAt of [null, undefined]) {
      expect(
        policy.hasConfirmedOutletScope({
          ...d,
          scopeConfirmation: { ...d.scopeConfirmation, confirmedAt },
        } as OutletScopeDeal),
      ).toBe(true)
    }
    expect(
      policy.hasConfirmedOutletScope({
        ...d,
        scopeConfirmation: { ...d.scopeConfirmation, confirmedAt: new Date('invalid') },
      }),
    ).toBe(false)
  })

  it('refuses malformed versions, roster values and unbounded disposition codes', () => {
    const d = confirmedDeal()
    for (const contentVersion of [0, -1, 1.5, Number.NaN]) {
      expect(policy.hasConfirmedOutletScope(confirmedDeal({ contentVersion }))).toBe(false)
    }
    for (const reasonCode of ['', 'x'.repeat(129), 42]) {
      expect(
        policy.hasConfirmedOutletScope({
          ...d,
          scopeConfirmation: { ...d.scopeConfirmation, reasonCode },
        } as OutletScopeDeal),
      ).toBe(false)
    }
    expect(policy.hasConfirmedOutletScope(confirmedDeal({ selectedVenueIds: [''] }))).toBe(false)
    const legacy = confirmedDeal(
      { applicability: 'ALL_MERCHANT_OUTLETS', selectedVenueIds: [] },
      'LEGACY_RETAINED',
    )
    legacy.scopeConfirmation.retainedVenueIds = ['']
    expect(policy.hasConfirmedOutletScope(legacy)).toBe(false)
  })

  it('distinguishes deliberately SOURCE_NONSPATIAL online/no-fixed offers from unknown parser defaults', () => {
    for (const applicability of ['ONLINE', 'NO_FIXED_LOCATION'] as const) {
      const d = confirmedDeal(
        { applicability, merchantId: null, selectedVenueIds: [] },
        'SOURCE_NONSPATIAL',
      )
      expect(policy.hasConfirmedOutletScope(d)).toBe(true)
      expect(policy.hasConfirmedOutletScope({ ...d, scopeConfirmation: null })).toBe(false)
      expect(
        policy.hasConfirmedOutletScope(confirmedDeal({ applicability }, 'SOURCE_NONSPATIAL')),
      ).toBe(false)
      for (const basis of ['SOURCE_SELECTED', 'SOURCE_ALL', 'UNCONFIRMED'] as const) {
        expect(
          policy.hasConfirmedOutletScope(
            confirmedDeal({ applicability, selectedVenueIds: [] }, basis),
          ),
        ).toBe(false)
      }
    }
  })

  it('allows SOURCE_ALL only for unconditional dynamic ALL or a separately reviewed selected snapshot', () => {
    for (const applicability of ['ALL_MERCHANT_OUTLETS', 'SELECTED_OUTLETS'] as const) {
      const d = confirmedDeal(
        {
          applicability,
          selectedVenueIds: applicability === 'SELECTED_OUTLETS' ? [venue().id] : [],
        },
        'SOURCE_ALL',
      )
      expect(policy.hasConfirmedOutletScope(d)).toBe(true)
      expect(policy.hasConfirmedOutletScope({ ...d, contentVersion: d.contentVersion + 1 })).toBe(
        false,
      )
    }
    for (const basis of ['SOURCE_SELECTED', 'SOURCE_NONSPATIAL', 'UNCONFIRMED'] as const) {
      expect(
        policy.hasConfirmedOutletScope(
          confirmedDeal({ applicability: 'ALL_MERCHANT_OUTLETS', selectedVenueIds: [] }, basis),
        ),
      ).toBe(false)
    }
    expect(
      policy.hasConfirmedOutletScope(
        confirmedDeal({ applicability: 'ALL_MERCHANT_OUTLETS' }, 'SOURCE_ALL'),
      ),
    ).toBe(false)
  })

  it('accepts legacy scope only with an explicit exact retained roster and current version/hash', () => {
    for (const applicability of [
      'SELECTED_OUTLETS',
      'ALL_MERCHANT_OUTLETS',
      'ONLINE',
      'NO_FIXED_LOCATION',
    ] as const) {
      const physical =
        applicability === 'SELECTED_OUTLETS' || applicability === 'ALL_MERCHANT_OUTLETS'
      const d = confirmedDeal(
        {
          applicability,
          selectedVenueIds: applicability === 'SELECTED_OUTLETS' ? [venue().id] : [],
        },
        'LEGACY_RETAINED',
      )
      d.scopeConfirmation = {
        ...d.scopeConfirmation,
        confirmedAt: null,
        retainedVenueIds: physical ? [venue().id] : [],
      }
      expect(policy.hasConfirmedOutletScope(d)).toBe(true)
      expect(policy.hasConfirmedOutletScope({ ...d, contentVersion: 8 })).toBe(false)
      if (physical) {
        expect(
          policy.hasConfirmedOutletScope({
            ...d,
            scopeConfirmation: { ...d.scopeConfirmation, retainedVenueIds: [] },
          }),
        ).toBe(false)
      } else {
        expect(
          policy.hasConfirmedOutletScope({
            ...d,
            scopeConfirmation: { ...d.scopeConfirmation, retainedVenueIds: [venue().id] },
          }),
        ).toBe(false)
      }
    }
    const selected = confirmedDeal({}, 'LEGACY_RETAINED')
    selected.scopeConfirmation.retainedVenueIds = ['444444444444444444444444']
    expect(policy.hasConfirmedOutletScope(selected)).toBe(false)
  })

  it('requires a structurally complete current selected receipt, not null, unconfirmed, or stale edges', () => {
    const d = confirmedDeal()
    expect(policy.hasConfirmedOutletScope(d)).toBe(true)
    for (const scopeConfirmation of [
      undefined,
      null,
      {},
      { ...d.scopeConfirmation, basis: 'UNCONFIRMED' },
      { ...d.scopeConfirmation, evidenceRef: '' },
      { ...d.scopeConfirmation, retainedVenueIds: undefined },
      { ...d.scopeConfirmation, retainedVenueIds: [venue().id] },
    ]) {
      expect(policy.hasConfirmedOutletScope({ ...d, scopeConfirmation } as OutletScopeDeal)).toBe(
        false,
      )
    }
    expect(policy.hasConfirmedOutletScope({ ...d, contentVersion: 8 })).toBe(false)
    expect(
      policy.hasConfirmedOutletScope({
        ...d,
        selectedVenueIds: [...d.selectedVenueIds, 'deleted-edge'],
      }),
    ).toBe(false)
    expect(policy.hasConfirmedOutletScope(confirmedDeal({ selectedVenueIds: [] }))).toBe(false)
    expect(policy.hasConfirmedOutletScope(confirmedDeal({ merchantId: null }))).toBe(false)
  })
})

describe('eligible physical campaign venues', () => {
  it('retains only the exact legacy roster with bound subject proofs and cannot lend legacy proof to a new campaign', () => {
    const v = verifiedVenue()
    const legacy: OutletPolicyVenue = {
      ...v,
      geographyEvidence: {
        ...v.geographyEvidence,
        state: 'LEGACY_RETAINED',
        provider: 'DATABASE_SNAPSHOT',
        verifiedAt: null,
      },
      occupancyEvidence: {
        ...v.occupancyEvidence,
        state: 'LEGACY_RETAINED',
        provider: 'DATABASE_SNAPSHOT',
        verifiedAt: null,
      },
    }
    for (const applicability of ['SELECTED_OUTLETS', 'ALL_MERCHANT_OUTLETS'] as const) {
      const d = confirmedDeal(
        { applicability, selectedVenueIds: applicability === 'SELECTED_OUTLETS' ? [v.id] : [] },
        'LEGACY_RETAINED',
      )
      d.scopeConfirmation.retainedVenueIds = [v.id]
      expect(policy.eligibleVenuesForScope(d, [legacy], true)).toEqual([legacy])
      const newIdentity = { ...v, id: '444444444444444444444444' }
      const newBranch = {
        ...newIdentity,
        geographyEvidence: {
          ...v.geographyEvidence,
          subjectHash: policy.geographySubjectHash(newIdentity),
        },
        occupancyEvidence: {
          ...v.occupancyEvidence,
          subjectHash: policy.occupancySubjectHash(newIdentity),
        },
      }
      expect(policy.eligibleVenuesForScope(d, [legacy, newBranch], true)).toEqual([legacy])
      expect(
        policy.eligibleVenuesForScope(d, [{ ...legacy, address: 'Changed identity' }], true),
      ).toEqual([])
      expect(
        policy.eligibleVenuesForScope(d, [{ ...legacy, occupancyEvidence: null }], true),
      ).toEqual([])
      expect(policy.eligibleVenuesForScope(d, [v], true)).toEqual([v])
      const newCampaign = confirmedDeal(
        { id: '666666666666666666666666', applicability, selectedVenueIds: d.selectedVenueIds },
        applicability === 'SELECTED_OUTLETS' ? 'SOURCE_SELECTED' : 'SOURCE_ALL',
      )
      expect(policy.eligibleVenuesForScope(newCampaign, [legacy], true)).toEqual([])
    }
    expect(policy.hasVerifiedGeography(legacy)).toBe(false)
    expect(policy.hasVerifiedOccupancy(legacy)).toBe(false)
    expect(policy.isSelectableCatalogueVenue(legacy)).toBe(false)
  })

  it('projects only active same-merchant verified physical scope members and deduplicates by ID', () => {
    const first = verifiedVenue()
    const secondIdentity = { ...venue(), id: '444444444444444444444444' }
    const second: OutletPolicyVenue = {
      ...secondIdentity,
      geographyEvidence: {
        ...first.geographyEvidence,
        subjectHash: policy.geographySubjectHash(secondIdentity),
      },
      occupancyEvidence: {
        ...first.occupancyEvidence,
        subjectHash: policy.occupancySubjectHash(secondIdentity),
      },
    }
    for (const [applicability, basis] of [
      ['SELECTED_OUTLETS', 'SOURCE_SELECTED'],
      ['SELECTED_OUTLETS', 'SOURCE_ALL'],
      ['ALL_MERCHANT_OUTLETS', 'SOURCE_ALL'],
    ] as const) {
      const d = confirmedDeal(
        {
          applicability,
          selectedVenueIds: applicability === 'SELECTED_OUTLETS' ? [first.id, second.id] : [],
        },
        basis,
      )
      expect(policy.eligibleVenuesForScope(d, [first, first, second], true)).toEqual([
        first,
        second,
      ])
      expect(policy.eligibleVenuesForScope(d, [first], false)).toEqual([])
      expect(
        policy.eligibleVenuesForScope({ ...d, scopeConfirmation: null }, [first], true),
      ).toEqual([])
      expect(
        policy.eligibleVenuesForScope(
          d,
          [
            { ...first, deletedAt: new Date() },
            { ...first, merchantId: 'foreign-merchant' },
            { ...first, occupancyEvidence: null },
            { ...first, geographyEvidence: null },
            { ...first, latitude: Infinity },
          ],
          true,
        ),
      ).toEqual([])
    }
    const selected = confirmedDeal()
    expect(policy.eligibleVenuesForScope(selected, [second, first], true)).toEqual([first])
    for (const applicability of ['ONLINE', 'NO_FIXED_LOCATION'] as const) {
      expect(
        policy.eligibleVenuesForScope(
          confirmedDeal({ applicability, selectedVenueIds: [] }, 'SOURCE_NONSPATIAL'),
          [first],
          true,
        ),
      ).toEqual([])
    }
  })
})

describe('characterization of the implemented proof boundary', () => {
  const identityChanges: [string, Partial<OutletPolicyVenue>][] = [
    ['id', { id: '444444444444444444444444' }],
    ['merchant', { merchantId: '555555555555555555555555' }],
    ['name', { name: 'SYNTHETIC Branch' }],
    ['address', { address: 'SYNTHETIC address ' }],
    ['postal', { postalCode: '123456' }],
    ['latitude', { latitude: 12.31 }],
    ['longitude', { longitude: -45.61 }],
    ['key', { catalogueKey: 'SYNTHETIC:branch:1' }],
    ['precision', { geographyPrecision: 'OUTLET' }],
  ]
  it.each(identityChanges)(
    'invalidates both subject proofs after an exact %s change',
    (_label, changes) => {
      const v = verifiedVenue()
      const changed = { ...v, ...changes }
      expect(policy.geographySubjectHash(changed)).not.toBe(policy.geographySubjectHash(v))
      expect(policy.occupancySubjectHash(changed)).not.toBe(policy.occupancySubjectHash(v))
      expect(policy.hasVerifiedGeography(changed)).toBe(false)
      expect(policy.hasVerifiedOccupancy(changed)).toBe(false)
    },
  )

  it('equates optional null/unset but excludes timestamps and proof metadata from subject hashes', () => {
    const bare = {
      ...venue(),
      catalogueKey: undefined,
      geographyPrecision: undefined,
      postalCode: undefined,
    }
    const nulls = { ...bare, catalogueKey: null, geographyPrecision: null, postalCode: null }
    expect(policy.geographySubjectHash(bare)).toBe(policy.geographySubjectHash(nulls))
    expect(policy.occupancySubjectHash(bare)).toBe(policy.occupancySubjectHash(nulls))
    const v = verifiedVenue()
    const fenced = { ...v, updatedAt: new Date(), geographyEvidence: null }
    expect(policy.geographySubjectHash(fenced)).toBe(policy.geographySubjectHash(v))
    expect(policy.occupancySubjectHash(fenced)).toBe(policy.occupancySubjectHash(v))
    expect(policy.hasVerifiedOccupancy(fenced)).toBe(true)
  })

  it.each(['state', 'provider', 'reference', 'subjectHash', 'verifiedAt'] as const)(
    'refuses a missing required verification fact: %s',
    (key) => {
      const v = verifiedVenue()
      const geographyEvidence = { ...v.geographyEvidence } as Partial<OutletVerificationEvidence>
      const occupancyEvidence = { ...v.occupancyEvidence } as Partial<OutletVerificationEvidence>
      delete geographyEvidence[key]
      delete occupancyEvidence[key]
      expect(policy.hasVerifiedGeography({ ...v, geographyEvidence } as OutletPolicyVenue)).toBe(
        false,
      )
      expect(policy.hasVerifiedOccupancy({ ...v, occupancyEvidence } as OutletPolicyVenue)).toBe(
        false,
      )
    },
  )

  it.each(['ONEMAP', 'GOOGLE_PLACES', 'OFFICIAL_MERCHANT', 'OFFICIAL_PROPERTY', 'ADMIN'] as const)(
    'accepts geography-only provider %s without granting occupancy',
    (provider) => {
      const v = verifiedVenue()
      expect(
        policy.hasVerifiedGeography({
          ...v,
          geographyEvidence: { ...v.geographyEvidence, provider },
        }),
      ).toBe(true)
      expect(policy.hasVerifiedOccupancy({ ...v, occupancyEvidence: null })).toBe(false)
    },
  )

  it('canonicalizes only edge order/duplicates; never repairs identifiers or hashes a display subset', () => {
    const d = deal({ selectedVenueIds: [venue().id, 'deleted-edge', venue().id] })
    expect(policy.outletScopeHash(d)).toBe(
      policy.outletScopeHash({ ...d, selectedVenueIds: ['deleted-edge', venue().id] }),
    )
    for (const changed of [
      { ...d, merchantId: `${d.merchantId} ` },
      { ...d, applicability: 'ALL_MERCHANT_OUTLETS' as const },
      { ...d, selectedVenueIds: [venue().id] },
      { ...d, selectedVenueIds: [venue().id.toUpperCase(), 'deleted-edge-X'] },
    ])
      expect(policy.outletScopeHash(changed)).not.toBe(policy.outletScopeHash(d))
    expect(policy.outletScopeHash({ ...d, merchantId: null })).toBe(
      policy.outletScopeHash({ ...d, merchantId: undefined }),
    )
    expect(policy.outletScopeHash({ ...d, contentVersion: 8 })).toBe(policy.outletScopeHash(d))
    const confirmed = confirmedDeal({ selectedVenueIds: d.selectedVenueIds })
    expect(policy.eligibleVenuesForScope(confirmed, [verifiedVenue()], true)).toHaveLength(1)
    expect(policy.hasConfirmedOutletScope({ ...confirmed, selectedVenueIds: [venue().id] })).toBe(
      false,
    )
  })

  it.each(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'])(
    'does not let actor role %s upgrade invalid proof',
    (role) => {
      const v = { ...verifiedVenue(), role, occupancyEvidence: null }
      expect(policy.isSelectableCatalogueVenue(v)).toBe(false)
      expect(policy.eligibleVenuesForScope(confirmedDeal(), [v], true)).toEqual([])
    },
  )

  it('requires selected membership even for a valid foreign-merchant point and legacy compatibility', () => {
    const v = verifiedVenue()
    const foreign = { ...v, merchantId: '555555555555555555555555' }
    foreign.geographyEvidence = {
      ...v.geographyEvidence,
      subjectHash: policy.geographySubjectHash(foreign),
    }
    foreign.occupancyEvidence = {
      ...v.occupancyEvidence,
      subjectHash: policy.occupancySubjectHash(foreign),
    }
    expect(policy.eligibleVenuesForScope(confirmedDeal(), [foreign], true)).toEqual([])
    const legacy = confirmedDeal({}, 'LEGACY_RETAINED')
    legacy.scopeConfirmation.retainedVenueIds = [v.id]
    const badLegacy = {
      ...v,
      geographyEvidence: {
        ...v.geographyEvidence,
        state: 'LEGACY_RETAINED' as const,
        provider: 'ONEMAP' as const,
      },
    }
    expect(policy.eligibleVenuesForScope(legacy, [badLegacy], true)).toEqual([])
    expect(
      policy.eligibleVenuesForScope(
        legacy,
        [{ ...v, occupancyEvidence: { ...v.occupancyEvidence, subjectHash: 'wrong' } }],
        true,
      ),
    ).toEqual([])
    expect(policy.eligibleVenuesForScope(legacy, [{ ...v, latitude: -91 }], true)).toEqual([])
  })
})

describe('outlet identity hashes (synthetic fixtures only)', () => {
  it('hashes every selected ID in a versioned exact merchant/applicability domain', () => {
    const d = deal({ selectedVenueIds: ['deleted-id', venue().id, 'deleted-id'] })
    expect(policy.outletScopeHash(d)).toBe(
      digest(['outlet-scope:v1', d.applicability, d.merchantId, [venue().id, 'deleted-id'].sort()]),
    )
  })
  it('binds an exact typed tuple in separate versioned geography and occupancy domains', () => {
    const v = venue()
    const tuple = [
      v.id,
      v.merchantId,
      v.name,
      v.address,
      v.postalCode,
      v.latitude,
      v.longitude,
      v.catalogueKey,
      v.geographyPrecision,
    ]
    expect(policy.geographySubjectHash(v)).toBe(digest(['outlet-geography:v1', ...tuple]))
    expect(policy.occupancySubjectHash(v)).toBe(digest(['outlet-occupancy:v1', ...tuple]))
    expect(policy.geographySubjectHash(v)).not.toBe(policy.occupancySubjectHash(v))
  })
})
