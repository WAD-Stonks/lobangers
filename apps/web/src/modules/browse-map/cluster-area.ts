import { SINGAPORE_AREAS, type SingaporeArea } from '@web/modules/browse-map/singapore-areas'
import type { Coordinates } from '@web/modules/browse-map/types'

const squaredDegrees = (a: Coordinates, b: Coordinates): number =>
  (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2

export const areaFor = (point: Coordinates): SingaporeArea =>
  SINGAPORE_AREAS.reduce((best, area) =>
    squaredDegrees(point, area) < squaredDegrees(point, best) ? area : best,
  )

export const nearestArea = (point: Coordinates): string => areaFor(point).name
