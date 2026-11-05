export const resultsTitle = (state: {
  readonly count: number
  readonly loading: boolean
  readonly inArea: boolean
  readonly walkFiltered: boolean
}): string => {
  if (state.loading && state.count === 0) return 'Finding deals'
  const noun = state.count === 1 ? 'deal' : 'deals'
  if (state.inArea) return `${state.count} ${noun} in this area`
  return state.walkFiltered ? `${state.count} ${noun} nearby` : `${state.count} ${noun}`
}
