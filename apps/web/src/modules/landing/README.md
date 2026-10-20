# Lobangers landing page

`LandingPage.vue` composes the hero, scroll introduction, discovery story, cuisine samples and final call to action. The landing route uses its own navigation; `/browse` remains the live deal map.

## Current components

- `HeroSection.vue`, `IllustratedMap.vue`, `FoodMapPin.vue` and `HeroWaterfront.vue` provide the featured sample offer, selectable regional pins and animated landmarks. Landmark animations continue during map hover. Reduced motion stops decorative movement.
- `ScrollStory.vue` owns the scroll narrative. `story-timeline.ts`, `use-story-progress.ts` and `use-story-playback.ts` handle reversible progress, optional playback and the still view.
- `FloatingSocialPost.vue` presents illustrative sources. `NeighbourhoodDetail.vue` supplies the illustrated neighbourhood close-up and the portal marker uses a bowl SVG.
- `CommunityFreshnessScene.vue` explains recent community reports using the animated hawker stall. See [COMMUNITY_SCENE.md](./COMMUNITY_SCENE.md) for renderer lifecycle, fallback behavior and sample-status logic.
- `CuisineDiscovery.vue` filters illustrative offers and separately renders live API results. Sample content is explicitly labelled; sample links lead to the live browser.
- `use-landing-motion.ts` enhances content with scroll reveals. The introduction stays hidden at the top of the page and fades after scrolling. Reduced motion or missing observation support leaves content readable.

## Active assets

Assets are served from `apps/web/public`:

| Asset | Use |
| --- | --- |
| `landing/singapore-map-hero-water-extended-{768,1536}.webp` | Responsive hero artwork |
| `landing/hero-water-edge-mask.svg` | Smooth lower-right water boundary |
| `landing/singapore-map-hero-complete-1536.webp` | Story's island map |
| `landing/singapore-map-soft-sea.png` | Shared map component's default artwork |
| `landing/neighbourhood-map.png` | Story close-up |
| `landing/{burger,tea,noodles,dessert,rice}.jpg` | Illustrative food photographs |
| `landing/scattered-feed-backdrop.svg` | Noninteractive conversation fragments behind the opening story |
| `fonts/lobang-pop-v6/LobangPop-Heavy.{woff2,woff}` | Current display font and web fallback |

`landing-backgrounds.css` contains the rounded background shapes and washes. Decorations do not accept pointer input or introduce continuous animation. The older map exports, rejected background designs and v5 web font pack have been removed from public assets.

The current font pack retains its license, provenance, QA report, desktop TTF and standalone stylesheet. `tools/fonts/lobang-pop/build_v6.py` and its baseline font are rebuild inputs. `output/imagegen` contains illustration generation sources and prompts; `artifacts` contains review screenshots and the exported font pack. These are design/build records, not runtime imports.

## Styling

The base `landing.css` is followed by narrative choreography in `cinematic-story.css`, hero details in `hero-effects.css` and `hero-layout.css`, responsive/accessibility overrides in `landing-usability.css`, community styles in `community-freshness.css`, and decorative backgrounds in `landing-backgrounds.css`.

## Verification

From `apps/web`, run `vue-tsc --noEmit`, `vitest run` and `vite build`. Landing tests cover sample navigation, filters, accessible controls and the story; community and renderer tests cover reversible handoff, status logic, lazy loading, context loss and cleanup. Vite currently reports large main and Three.js chunks; no measured performance score is claimed.
