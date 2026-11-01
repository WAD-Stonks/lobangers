// Keep validated transport evidence separate from the normalized parser/display
// DTO. Non-enumerable metadata cannot leak into strict DTO or display projections.
const providerEnvelope = Symbol.for('@broke-oclock/integrations/provider-envelope/v1')
export const withProviderEnvelope = <T extends object>(
  projection: T,
  original: Record<string, unknown>,
): T => Object.defineProperty(projection, providerEnvelope, { value: original })
export const readProviderEnvelope = (projection: unknown): unknown =>
  typeof projection === 'object' && projection !== null
    ? Reflect.get(projection, providerEnvelope)
    : undefined
