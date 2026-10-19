# Animated hawker stall and community freshness

## Rendering and composition

`HawkerStallModel.vue` lazy-loads `hawker-three.ts` when the selected offer is revealed. Three.js builds actual meshes in one world space: +Z faces the customer, and a fixed orthographic camera sees the front, left side, countertop and awning depth. The reference informs the coral/gold scalloped awning, green posts, cream walls, orange counter, roof sign, lamps, cabinet, stylised chicken/rice props, bowls, sauces, utensils, side sign, stools, greenery and tiled rounded platform. This is a procedural interpretation, not an exact scan of the reference.

Rounded boxes, low-resolution spheres, lathed bowls and extruded fabric scallops share geometry/materials where practical. Canvas textures provide the selected restaurant, neighbourhood, price, savings, menu and branding using the self-hosted Lobang Pop font. One directional light casts 1024px soft shadows; hemisphere/fill lights and matte materials supply warm lighting. No remote 3D assets or image-generation services are used.

The WebGL module is a separate dynamic chunk. DPR is capped at 1.5. Rendering is on demand from scroll/resize/visibility changes, with no continuous animation loop. ResizeObserver, queued animation frames, renderer, geometry, materials and textures are disposed on unmount or selected-deal rebuild. A context-loss listener switches to `HawkerStallFallback.vue`, the existing honest 2.5D SVG illustration. Unsupported WebGL, Save Data mode and devices reporting 2GB or less memory also use that fallback.

## One reversible timeline

`ScrollStory.vue` retains the existing single scroll reader and selected deal. The community scene still occupies the final 22% of that story, without another scroll trap or pinned container. `communityTimeline` maps local progress to:

- 0–34%: the same mounted deal article moves toward the projected roof sign. The 3D sign emerges during 25–34%; the HTML card crossfades over the same selected restaurant/price. The photograph shrinks and fades as the real food props take over.
- 10–19%: platform rises; 15–27%: counter, walls and posts assemble.
- 23–34%: awning and illuminated sign settle; 30–40%: food and decorations enter with small deterministic staggered scale changes.
- 35–55%: HTML sample reports arrive and settle along short curves. SVG dotted paths stay behind the model.
- 55–70%: report icons travel toward the counter-mounted flip sign. The secondary pulse counts recent sample observations, never an availability percentage.
- 70–85%: a small framed HTML sign flips from checking reports to the derived community status. It follows the projected counter anchor; the roof restaurant/price sign stays visible. The still view shows the completed status beneath the stall.
- 85–95%: non-interactive voting previews, signup explanation and actual navigation links enter.

All motion is a pure function of scroll position and reverses when scrolling upward. The camera never orbits. Physical assembly stays in the same 3D world space; report and CTA text stays accessible HTML.

## Reports and trust

A fixed fictional clock makes the demonstration reproducible. Positive reports are 18m, 52m and 3h old; caution reports are 32h and 27h old and visibly excluded from the illustrative 24h window. At least two consistent recent positive/ended reports produce “Likely Still On”/“Reported Ended”; conflicts or insufficient evidence produce “Uncertain”; no recent evidence produces “No Recent Reports.” This is sample explanatory logic, not production availability verification. Dates and terms still need checking.

`CommunityOrbit.vue`, `CommunityPulse.vue` and `CommunityFreshnessScene.vue` display those observations and their derived status. `JoinCommunityCTA.vue` uses `/register` and `/browse`. `VotingPreview.vue` uses plain text spans: no buttons, handlers, report writes, persistence or vote requests. The API contains no implemented public vote-submission endpoint; authentication remains unchanged. Future actual voting must enforce server-side session and authorization checks.

## Responsive and reduced motion

Desktop reserves space beside the model for reports and explanatory copy. Tablet/phone scenes scale the miniature and place compact reports beneath it. Existing compact-screen, OS reduced-motion and “Show still version” modes show a complete scene in normal document flow, with all reports, the status, previews and signup links immediately available. Important deal/status content is mirrored in HTML rather than relying on canvas text. Only actual navigation actions are focusable.

## Files

- `hawker-three.ts`: procedural mesh model, lights, selected-deal textures, projection anchors, assembly and disposal.
- `HawkerStallModel.vue`: lazy renderer lifecycle and SVG fallback.
- `HawkerStallFallback.vue`, `hawker-projection.ts`: existing shared-projection vector fallback.
- `CommunityFreshnessScene.vue`: handoff, projected status anchor, accessible content and scene composition.
- `community-freshness.ts`: timeline, responsive layout and illustrative evidence logic.
- `CommunityOrbit.vue`, `CommunityPulse.vue`: reports, signals and recent-count indicator.
- `JoinCommunityCTA.vue`, `VotingPreview.vue`: registration/browse links and read-only previews.
- `community-freshness.css`: responsive scene and static layout.

Three.js is the sole new runtime dependency; `@types/three` supplies development types. Vue and the existing native scroll architecture are reused. No GSAP/TresJS dependency is needed for this fixed-camera, on-demand scene.

## Validation of this revision

Frontend type checking, 281 unit tests, repository Biome lint and Vite production build pass. Browser checks cover desktop (1800×1043), tablet (768×1024), phone (390×844), reversible handoff, status reveal and the completed still view. New tests exercise lazy initialisation, selected-deal rebuild, context-loss fallback, disposal and reversible HTML-to-sign continuity. The new dynamic renderer chunk is approximately 147KB gzipped; Vite reports the existing main-chunk warning and the renderer's greater-than-500KB uncompressed size. There is no fabricated Lighthouse score or real-device GPU benchmark. Screenshots are saved under `artifacts/hawker-community-desktop.png`, `artifacts/hawker-community-phone.png` and `artifacts/hawker-assembly.png`.
