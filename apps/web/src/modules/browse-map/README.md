# Browse and map

Owner: Allison. Reviewer: Ashley. Routes: `/` (list panel), `/deals/:dealId` (deal panel). `/browse` redirects to `/`, and `/deals` redirects to `/?view=list`.

These panels render inside the map shell (`src/pages/MapShell.vue`, see `../map-shell/README.md`), which owns the map, header, controls and filter state. This module supplies the map itself, the deal data helpers and the two browse panels.

## Data flow

The shell loads `GET /api/deals` once per validity setting: only `validNow` goes to the API, because the server also checks start dates the client never sees. Every other filter runs client-side in `apply-filters.ts`, so the filter sheet can count matches live. The price cap mirrors the API: deals with no fixed price (1-for-1, % off) stay in.

1. `filterDeals` narrows by search, category, deal type, price and ending window.
2. `toVenuePins` groups the remaining deals into one pin per outlet.
3. `filterVenues` applies walking distance (only once the visitor is located) and "Search this area".
4. `toDealRows` makes one row per deal and outlet, nearest-first when located, then `sortRows` applies the sort.

## Files

- `filters.ts`: the immutable `BrowseFilters` shape, `createDefaultFilters`, `updateFilters`, `toggleValue` and `countSheetFilters` (the "All filters" badge).
- `apply-filters.ts`: the client-side filters above, plus `isVerified`, `isEndingToday`, `walkMinutesFor` and `uniqueDealCount`.
- `filter-tokens.ts`: removable "active filter" tokens for the list panel.
- `load-deals.ts`: `toDealsQuery`, `toVenuePins` and `toDealRows`.
- `deal-format.ts`: `formatValidity`, `formatEnding`, `formatCategory`, `formatOtherOutlets`, `dealFreshness` (the status tag) and `priceText`.
- `DealMap.vue`: Leaflet lifecycle, CARTO or OneMap tiles (`basemap.ts`), Singapore bounds, clustered pins with verified and ending-today flags, the "you are here" dot, selected/dimmed/hovered pin states, `flyTo` for far jumps and `panTo` for short hops, offset so a focused pin lands beside the panel. Emits `select`, `hover` and `moved` (a drag by the visitor). Exposes `zoomIn`, `zoomOut` and `getArea`. Reduced motion turns Leaflet animation off.
- `venue-pin.ts`: `createVenuePinIcon`, built from DOM nodes so deal text is never parsed as HTML.
- `BrowseListPanel.vue`: count heading, sort, location notice, filter tokens, rows (map view) or cards (list view), and loading, error and empty states.
- `DealRowList.vue` / `DealCardGrid.vue`: rows and cards that link to the deal panel; hovering a row lights its pin.
- `DealPanel.vue`: deal details, `DealReviewSummary`, more deals at the outlet, and the sticky Save and Get directions bar. Save is optimistic and rolls back with an error toast.
- `CategoryBubble.vue`, `DealReviewSummary.vue`, `category-style.ts`, `distance.ts`, `singapore-bounds.ts`, `map-config.ts`, `use-geolocation.ts`, `types.ts`: unchanged helpers.

## Still to do

- Deal photos: `GET /api/deals` does not return images yet, so the deal panel shows a tinted block.
- Voting, comments and reports in the deal panel, once the community module exposes them. The panel only reads the tallies the deals list returns.
- Halal, vegetarian and "fresh in 24h" filters need schema fields first (doc section 11).
- A separate list for `ONLINE` and `NO_FIXED_LOCATION` deals; never invent coordinates for them.

Only approved published deals with matching content/review versions and source attribution may reach the map. See [feature-plan.md](../../../../../docs/feature-plan.md) and [ingestion.md](../../../../../docs/ingestion.md).
