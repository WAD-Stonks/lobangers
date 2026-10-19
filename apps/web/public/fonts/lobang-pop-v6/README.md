# Lobang Pop Heavy — Revision 6

Lowercase **s** has a slightly fuller diagonal waist. Lowercase **t** has a redrawn rounded crossbar, stem and foot. Accented composites using these base glyphs inherit the changes. All other base outlines, advances, side bearings, kerning, character coverage and line metrics remain unchanged from v5.

Web formats: WOFF2 (preferred) and WOFF. Desktop format: TTF. Weight: 900. Family: Lobang Pop. Use `font-display: swap`.

To rebuild the standalone pack, install `fonttools` and `brotli`, then run `python source/build_v6.py`. The source includes the v5 baseline and the new outlines. Repository build command: `python tools/fonts/lobang-pop/build_v6.py`.

Validation: all three formats decode successfully; all unchanged simple glyphs, composite placements, metrics and kerning are compared with the v5 baseline. This is a targeted lowercase refinement, not a redraw of the entire alphabet.

Distributed under the included SIL Open Font License 1.1, with upstream notices retained.

## Previous revision provenance

# Lobang Pop Heavy — Revision 5

Revised 19 October 2026. Recovered from the locally downloaded original font pack, because the earlier ChatGPT workspace at `/mnt/data/bang-buck-work` is unavailable on this computer.

## What changed

Revision 5 additionally redraws **m, p, q, s, v, w, x and z** to match the traced lowercase n, b, g, o, y and k. The new m uses two compact rounded arches; p and q have heavy bowls and soft descenders; s has broad curved terminals; v, w, x and z use softened diagonals and uneven contours.

Lowercase **e** has a new rounded upper counter, horizontal crossbar and open mouth. Twenty-five capitals have new custom outlines, designed around the original traced **B**: thick strokes, compact counters, softened corners, gently uneven edges and playful proportions. **B itself is preserved.**

The authentic reference outlines and spacing for **B a n g f r y o u b c k .** are unchanged. The original “Bang for your buck.” headline therefore retains its original lettering.

Characters absent from the screenshot are interpretations. Other characters retain the recovered pack’s outlines, including Noto-derived supporting lowercase letters, digits, punctuation and extended Latin. This is a display font for headlines; the revision concentrates on A–Z and e, m, p, q, s, v, w, x, z. It does not claim a complete custom redraw of every supported Unicode character.

## Files

- `fonts/LobangPop-Heavy.ttf` — desktop font
- `fonts/LobangPop-Heavy.woff2` — preferred web font
- `fonts/LobangPop-Heavy.woff` — compatible web fallback
- `fonts/lobang-pop.css` — ready-to-use font declaration and classes
- `index.html` — offline editable specimen; also shows font-loading results
- `specimen.png` — alphabet, headline and e examples
- `character-set.png` — all 94 visible ASCII characters (space is also mapped)
- `detail-preview.png` — large family and readability checks
- `QA-report.json` — preservation, format checks and file checksums
- `source/` — editable outline definitions, rebuild scripts, archived original font, original screenshot and upstream font
- `OFL-LICENSE.txt` — included SIL Open Font License and upstream notices

## Website use

Copy `fonts/` into your site's public assets. Include:

```html
<link rel="stylesheet" href="/fonts/lobang-pop.css">
<h1 class="lobang-headline">Bang for your buck.</h1>
```

The single available weight is 900. Start with `line-height: 1.02` and zero letter spacing; adjust for the actual headline. Replace older font files and refresh the browser cache. A versioned asset folder such as `/fonts/lobang-pop-v5/` can avoid cached copies.

Open `index.html` for a live editable preview. If a browser blocks local font loading, serve the folder with your normal development server. It has no external resources or network dependencies.

## Verification

All 95 printable ASCII code points are mapped. The authentic traced outlines and metrics match the archived original exactly. TTF, WOFF and WOFF2 decode with identical outlines and spacing, render after round-trip decoding, and all three load successfully in the browser. The complete basic alphabet, digits, punctuation and headline were visually inspected, along with repeated e and sample words. Extended Latin remains inherited and was not comprehensively visually reviewed.

## Rebuild

Requires Python 3, `fonttools` and `brotli`:

```sh
python source/build_font.py
```

Edit `source/custom_shapes.py` for the new capital and lowercase outlines. Paths use reference-pixel coordinates with y down; the build converts them into quadratic TrueType curves. The build starts from `source/LobangPop-Original.ttf` to preserve the original sample traces exactly. `build_original.py` archives the earlier screenshot-tracing process and additionally needs Pillow, numpy, scipy and OpenCV. Rebuilding is optional; the exported fonts are ready to use.

## License and provenance

Distributed under SIL Open Font License 1.1, with the original upstream notices retained. Unchanged and adapted upstream components come from Noto Sans Black. The renamed family is Lobang Pop. Reference artwork is included as supplied by the user; its inclusion does not imply ownership of the original artwork. This pack reconstructs a short lettering sample rather than identifying a pre-existing typeface.
