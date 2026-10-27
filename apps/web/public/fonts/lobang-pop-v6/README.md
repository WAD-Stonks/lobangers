# Lobang Pop Heavy — Revision 6

Lowercase **s** has a slightly fuller diagonal waist. Lowercase **t** has a redrawn rounded crossbar, stem and foot. Accented composites using these base glyphs inherit the changes. All other base outlines, advances, side bearings, kerning, character coverage and line metrics remain unchanged from v5.

Web formats: WOFF2 (preferred) and WOFF. Desktop format: TTF. Weight: 900. Family: Lobang Pop. Use `font-display: swap`.

## Files used by the app

- `LobangPop-Heavy.woff2` — preferred web font; preloaded by `apps/web/index.html`.
- `LobangPop-Heavy.woff` — web fallback.
- `OFL-LICENSE.txt` — SIL Open Font License 1.1 and upstream notices; retain with the fonts.
- `QA-report.json` — original revision 6 export verification, including the historical desktop TTF checksum. The desktop export is no longer shipped.

The active font declaration is in `apps/web/src/modules/landing/landing.css`. No separate font stylesheet is required. Use weight 900 and `font-display: swap`.

The unused desktop TTF, standalone specimen stylesheet and orphaned v5 baseline have been removed. Rebuild scripts and the original specimen pack are not included in this repository. The web fonts remain byte-for-byte identical to the checksums in the original QA record.

## Previous revision provenance

# Lobang Pop Heavy — Revision 5

Revised 19 October 2026. Recovered from the locally downloaded original font pack, because the earlier ChatGPT workspace at `/mnt/data/bang-buck-work` is unavailable on this computer.

## What changed

Revision 5 additionally redraws **m, p, q, s, v, w, x and z** to match the traced lowercase n, b, g, o, y and k. The new m uses two compact rounded arches; p and q have heavy bowls and soft descenders; s has broad curved terminals; v, w, x and z use softened diagonals and uneven contours.

Lowercase **e** has a new rounded upper counter, horizontal crossbar and open mouth. Twenty-five capitals have new custom outlines, designed around the original traced **B**: thick strokes, compact counters, softened corners, gently uneven edges and playful proportions. **B itself is preserved.**

The authentic reference outlines and spacing for **B a n g f r y o u b c k .** are unchanged. The original “Bang for your buck.” headline therefore retains its original lettering.

Characters absent from the screenshot are interpretations. Other characters retain the recovered pack’s outlines, including Noto-derived supporting lowercase letters, digits, punctuation and extended Latin. This is a display font for headlines; the revision concentrates on A–Z and e, m, p, q, s, v, w, x, z. It does not claim a complete custom redraw of every supported Unicode character.

## License and provenance

Distributed under SIL Open Font License 1.1, with the original upstream notices retained. Unchanged and adapted upstream components come from Noto Sans Black. The renamed family is Lobang Pop. This pack reconstructs a short lettering sample rather than identifying a pre-existing typeface. Supporting glyphs and extended Latin remain inherited; the revision does not claim a complete custom redraw of every Unicode character.
