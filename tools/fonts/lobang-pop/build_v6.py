"""Refine lowercase s/t only. Requires fonttools and brotli (Pillow for specimen).
Run: python tools/fonts/lobang-pop/build_v6.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.svgLib.path import parse_path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / 'apps/web/public/fonts/lobang-pop-v6'
OUT.mkdir(parents=True, exist_ok=True)
BASE = HERE / 'LobangPop-v5-base.ttf'
font = TTFont(BASE, recalcTimestamp=False)
cmap = font.getBestCmap()
# Reference-pixel coordinates, y down. Openings stay clear; the diagonal gains ~5px.
S_PATH = 'M90 5 Q99 8 96 16 L89 34 Q86 41 79 38 C62 30 39 31 39 39 C39 43 51 44 67 50 C112 67 108 112 62 117 Q28 121 5 108 Q-1 104 2 97 L9 79 Q12 72 19 77 C38 88 65 91 66 84 C67 78 52 76 35 70 C-4 55 -2 10 38 2 Q67 -4 90 5 Z'
# Font-unit coordinates, y up. Rounded corners replace the inherited angular t.
T_PATH = 'M158 687 L235 687 Q259 687 259 663 L259 574 L359 574 Q383 574 383 550 L383 452 Q383 428 359 428 L259 428 L259 211 Q259 160 300 158 Q325 155 353 168 Q383 181 385 153 L387 48 Q389 26 367 20 Q312 -5 246 -5 Q84 -6 84 190 L84 428 L48 428 Q24 428 24 452 L24 505 Q24 519 52 537 L98 570 L132 669 Q138 687 158 687 Z'
for char, path in [('s', S_PATH), ('t', T_PATH)]:
    pen = TTGlyphPen(None)
    if char == 's':
        curves = Cu2QuPen(ReverseContourPen(pen), max_err=.65, reverse_direction=False)
        target = TransformPen(curves, (5.14, 0, 0, -5.03, 24, 570))
    else:
        target = Cu2QuPen(pen, max_err=.65, reverse_direction=False)
    parse_path(path, target)
    glyph = pen.glyph()
    glyph.recalcBounds(font['glyf'])
    font['glyf'][cmap[ord(char)]] = glyph
# Preserve advances, side bearings, kerning, character coverage and line metrics.
for platform, encoding, lang in [(3, 1, 0x409), (1, 0, 0)]:
    font['name'].setName('LobangPopHeavy-6.000', 3, platform, encoding, lang)
    font['name'].setName('Version 6.000', 5, platform, encoding, lang)
font['head'].fontRevision = 6.0
font['head'].modified = 3875126400
for flavor in (None, 'woff', 'woff2'):
    font.flavor = flavor
    font.save(OUT / ('LobangPop-Heavy.' + (flavor or 'ttf')))
# Read all formats back; compare every unchanged glyph and all layout tables.
baseline = TTFont(BASE)
for suffix in ('ttf', 'woff', 'woff2'):
    rebuilt = TTFont(OUT / f'LobangPop-Heavy.{suffix}')
    assert rebuilt.getBestCmap() == baseline.getBestCmap()
    assert rebuilt['hmtx'].metrics == baseline['hmtx'].metrics
    for table in ('GPOS', 'hhea', 'OS/2'):
        assert rebuilt[table].compile(rebuilt) == baseline[table].compile(baseline), table
    for name in baseline.getGlyphOrder():
        if name not in {cmap[ord('s')], cmap[ord('t')]}:
            after, before = rebuilt['glyf'][name], baseline['glyf'][name]
            if before.isComposite():
                # Accented t/s composites inherit the corrected base; preserve placement.
                assert [c.getComponentInfo() for c in after.components] == [c.getComponentInfo() for c in before.components], name
            else:
                assert after.compile(rebuilt['glyf']) == before.compile(baseline['glyf']), name
print('Validated TTF/WOFF/WOFF2: only s/t outlines changed; layout metrics retained.')
