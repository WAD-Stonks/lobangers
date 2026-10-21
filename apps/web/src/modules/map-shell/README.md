# Map shell

Owner: Allison. The layout every feature panel plugs into. Build plan: [map-shell-redesign.md](../../../../../docs/map-shell-redesign.md).

`src/pages/MapShell.vue` is the component for the `/` route. The map stays mounted while child routes (`browse`, `deal`, `venue`, `add-deal`, `login`, `register`, `profile`, `saved`, `merchant`) render in the panel slot, so moving between features never reloads the map. Admin pages and password reset stay outside the shell.

## Adding a panel

Fill `PanelFrame.vue`. It gives you the h1 (focused after navigation), an optional back link, the only scrolling area, and an optional sticky action bar:

```vue
<PanelFrame title="Venue name" :back="{ name: 'browse' }" :scroll-key="tab">
  …scrolling content…
  <template #actions>…sticky buttons…</template>
</PanelFrame>
```

Pass anything that changes the content (tab, step, sort) as `scroll-key`, and the panel jumps back to the top when it changes. Use `useShell()` for deals, filters and location, `useSavedDeals()` for bookmarks and `useToast()` for feedback. Use `dealLocation`, `venueLocation` and `browseLocation` from `shell-routes.ts` for links, so the visitor's filters come along.

## Layout

| Width | Panel | Filters | Header |
| --- | --- | --- | --- |
| < 768px | Bottom sheet: peek, half, full | Full screen | Menu and search, then chips ("Ending today" hidden) |
| 768–991px | Bottom sheet, inset 12px | Centred dialog | Same, all chips |
| ≥ 992px | 400px left column (list view widens it) | Popover under the chips | 500px, above the panel |

`use-shell-layout.ts` measures the header and works out the sheet heights and the map offset; they reach CSS as `--shell-header-bottom` and `--sheet-visible`. The sheet is always full height and slides with `transform`, and `--sheet-offset` tells the panel how much sits below the screen.

## Files

- `shell-state.ts`: deals, filters (read from the route query), sort, view, pins, rows, ending-soon deals, hover, location, plus `applyFilters` (push or replace) and `findDeal`.
- `filter-query.ts`: filters to and from `?q=&cat=&max=&now=&type=&walk=&when=`. Pure functions; defaults leave the URL clean.
- `nav-direction.ts`, `use-panel-scroll.ts`, `use-breakpoint.ts`, `use-hot-rotation.ts`, `use-toast.ts`, `use-saved-deals.ts`, `sheet-snap.ts`: the composables from the plan.
- `ShellHeader.vue` (`BrandMenu`, `SearchField`, `QuickChips`), `MapControls.vue`, `HotCard.vue`, `FilterSheet.vue`, `ShellPanel.vue`, `ShellToast.vue`, `ComingSoonPanel.vue`, `ShellIcon.vue`.
- `shell-ui.css`: shared primitives (`.lb-btn`, `.lb-chip`, `.lb-ctrl`, `.lb-tag`, `.lb-tabs`, `.lb-state`). `motion.css`: panel, menu, sheet and toast transitions, and the reduced-motion rules.

## Tests

Unit tests are in `apps/web/tests/` (`router-shell`, `map-shell`, `shell-components` and one file per composable). Layout and overflow checks are in `e2e/responsive.spec.ts`, and the journeys are in `e2e/map-shell.spec.ts`.
