// Complete policy tuple; never verify a picker using only the stored state enum.
export const catalogueVenueSelect = {
  id: true,
  merchantId: true,
  name: true,
  address: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  catalogueKey: true,
  geographyPrecision: true,
  geographyEvidence: true,
  occupancyEvidence: true,
  deletedAt: true,
  merchant: { select: { name: true, deletedAt: true } },
} as const

// This is only a coarse positive indexable filter. Always validate the subject hash after loading.
export const selectableCatalogueWhere = {
  occupancyEvidence: {
    is: {
      state: 'VERIFIED' as const,
      provider: {
        in: ['OFFICIAL_MERCHANT', 'OFFICIAL_PROPERTY', 'ADMIN'] as (
          | 'OFFICIAL_MERCHANT'
          | 'OFFICIAL_PROPERTY'
          | 'ADMIN'
        )[],
      },
    },
  },
}
