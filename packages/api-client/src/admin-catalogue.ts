import { type QueryInput, request, type SchemaInput, validateInput } from '@api-client/transport'
import * as schemas from '@broke-oclock/contracts/admin-catalogue'
import type { AxiosInstance } from 'axios'

export const createAdminCatalogueClient = (http: AxiosInstance) => ({
  merchants: (input: QueryInput<typeof schemas.catalogueMerchantsQuerySchema> = {}) => {
    const inputValue = validateInput(schemas.catalogueMerchantsQuerySchema, input)
    return request(
      http.get(`/admin/catalogue/merchants`, { params: inputValue }),
      schemas.catalogueMerchantsResponseSchema,
    )
  },
  merchant: (id: string) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    return request(
      http.get(`/admin/catalogue/merchants/${target}`),
      schemas.catalogueMerchantSchema,
    )
  },
  createMerchant: (input: SchemaInput<typeof schemas.createCatalogueMerchantSchema>) => {
    const inputValue = validateInput(schemas.createCatalogueMerchantSchema, input)
    return request(
      http.post(`/admin/catalogue/merchants`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
  patchMerchant: (id: string, input: SchemaInput<typeof schemas.patchCatalogueMerchantSchema>) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    const inputValue = validateInput(schemas.patchCatalogueMerchantSchema, input)
    return request(
      http.patch(`/admin/catalogue/merchants/${target}`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
  archiveMerchant: (id: string, input: SchemaInput<typeof schemas.catalogueMutationSchema>) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    const inputValue = validateInput(schemas.catalogueMutationSchema, input)
    return request(
      http.post(`/admin/catalogue/merchants/${target}/archive`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
  venues: (input: QueryInput<typeof schemas.catalogueVenuesQuerySchema> = {}) => {
    const inputValue = validateInput(schemas.catalogueVenuesQuerySchema, input)
    return request(
      http.get(`/admin/catalogue/venues`, { params: inputValue }),
      schemas.catalogueVenuesResponseSchema,
    )
  },
  venue: (id: string) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    return request(
      http.get(`/admin/catalogue/venues/${target}`),
      schemas.catalogueVenueDetailSchema,
    )
  },
  createVenue: (input: SchemaInput<typeof schemas.createCatalogueVenueSchema>) => {
    const inputValue = validateInput(schemas.createCatalogueVenueSchema, input)
    return request(
      http.post(`/admin/catalogue/venues`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
  patchVenue: (id: string, input: SchemaInput<typeof schemas.patchCatalogueVenueSchema>) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    const inputValue = validateInput(schemas.patchCatalogueVenueSchema, input)
    return request(
      http.patch(`/admin/catalogue/venues/${target}`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
  archiveVenue: (id: string, input: SchemaInput<typeof schemas.catalogueMutationSchema>) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    const inputValue = validateInput(schemas.catalogueMutationSchema, input)
    return request(
      http.post(`/admin/catalogue/venues/${target}/archive`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
  recordEvidence: (
    id: string,
    input: SchemaInput<typeof schemas.recordCatalogueEvidenceSchema>,
  ) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    const inputValue = validateInput(schemas.recordCatalogueEvidenceSchema, input)
    return request(
      http.post(`/admin/catalogue/venues/${target}/evidence`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
  withdrawEvidence: (
    id: string,
    input: SchemaInput<typeof schemas.withdrawCatalogueEvidenceSchema>,
  ) => {
    const target = validateInput(schemas.catalogueIdSchema, { id }).id
    const inputValue = validateInput(schemas.withdrawCatalogueEvidenceSchema, input)
    return request(
      http.post(`/admin/catalogue/venues/${target}/evidence/withdraw`, inputValue),
      schemas.catalogueMutationResponseSchema,
    )
  },
})
