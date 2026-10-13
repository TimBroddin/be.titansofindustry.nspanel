"""Build the NSPanel Homey icon font from Homey SVG icons.

Usage:
  scripts/icon-font/.venv/bin/python scripts/icon-font/build.py <svg-dir> [<svg-dir> ...]

Every *.svg under the given directories becomes one glyph. Keys are "<dir name>/<relative path without .svg>".
Codepoints are stable: tft/fonts/homey-icons-map.json keeps key -> codepoint, and new icons are appended,
so configured chips/tiles keep their icon across rebuilds.

Outputs:
  tft/fonts/NSPanelHomeyIcons.ttf        install in the CrossOver bottle, generate Nextion fonts from it
  tft/fonts/homey-icons-chars.txt        every glyph character, paste into the Nextion font generator
  tft/fonts/homey-icons-map.json         key -> codepoint (source of truth, committed)
  lib/homeyIcons.json                    key -> glyph character (used by the app and settings)
  settings/homey-icons.woff2             the same font for the settings page
"""

import json
import re
import sys
from pathlib import Path

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont
from picosvg.svg import SVG

ROOT = Path(__file__).resolve().parents[2]
MAP_FILE = ROOT / "tft/fonts/homey-icons-map.json"
UPM = 1000
PAD = 60
FIRST_CODEPOINT = 0xE000
LAST_CODEPOINT = 0xF8FF  # BMP private use area; Nextion utf-8 fonts are BMP-only


def is_white(fill: str) -> bool:
    f = (fill or "").strip().lower()
    if f in ("white", "#fff", "#ffffff"):
        return True
    if f.startswith("#") and len(f) == 7:
        r, g, b = (int(f[i:i + 2], 16) for i in (1, 3, 5))
        return min(r, g, b) >= 240
    return False


def to_pathops(d: str, fill_rule: str) -> pathops.Path:
    p = pathops.Path()
    parse_path(d, p.getPen())
    p.fillType = pathops.FillType.EVEN_ODD if fill_rule == "evenodd" else pathops.FillType.WINDING
    return p


def dedupe_ids(raw: str) -> str:
    """Rename repeated id="x" attributes (keeping the first, so #x references still resolve)."""
    seen = {}

    def rename(m):
        name = m.group(1)
        seen[name] = seen.get(name, 0) + 1
        return m.group(0) if seen[name] == 1 else f' id="{name}__dup{seen[name]}"'

    return re.sub(r'\sid="([^"]*)"', rename, raw)


def icon_outline(svg_file: Path):
    """Returns (pathops.Path in SVG coordinates, viewBox) or None if nothing visible."""
    raw = svg_file.read_text(encoding="utf-8", errors="replace")
    raw = re.sub(r"<text\b.*?</text>", "", raw, flags=re.S)  # labels inside icons: not drawable as outlines
    raw = dedupe_ids(raw)  # Sketch exports reuse ids, which picosvg rejects
    pico = SVG.fromstring(raw).topicosvg(ndigits=2)
    view = pico.view_box()
    ink, holes = pathops.Path(), pathops.Path()
    for shape in pico.shapes():
        if not shape.d or shape.fill in ("none", "transparent") or getattr(shape, "opacity", 1) == 0:
            continue
        target = holes if is_white(shape.fill) else ink
        target = pathops.op(target, to_pathops(shape.d, shape.fill_rule), pathops.PathOp.UNION)
        if is_white(shape.fill):
            holes = target
        else:
            ink = target
    if holes.area:
        ink = pathops.op(ink, holes, pathops.PathOp.DIFFERENCE)
    return (ink, view) if ink.area else None


def glyph_from(path: pathops.Path, view):
    vx, vy, vw, vh = view.x, view.y, view.w, view.h
    box = UPM - 2 * PAD
    s = box / max(vw, vh)
    off_x = PAD + (box - vw * s) / 2
    off_y = PAD + (box - vh * s) / 2
    # SVG y grows down, font y grows up: flip around the em box.
    transform = (s, 0, 0, -s, off_x - vx * s, UPM - off_y + vy * s)
    tt = TTGlyphPen(None)
    path.draw(TransformPen(Cu2QuPen(tt, max_err=1.0, reverse_direction=True), transform))
    return tt.glyph()


def main(dirs):
    mapping = json.loads(MAP_FILE.read_text()) if MAP_FILE.exists() else {}
    files = []
    for d in dirs:
        base = Path(d).resolve()
        for f in sorted(base.rglob("*.svg")):
            key = f"{base.name}/{f.relative_to(base).with_suffix('').as_posix()}"
            files.append((key, f))

    next_cp = max(mapping.values(), default=FIRST_CODEPOINT - 1) + 1
    glyphs, cmap, failed = {}, {}, []
    for key, f in files:
        try:
            outline = icon_outline(f)
        except Exception as err:  # noqa: BLE001 - report and skip broken SVGs
            failed.append(f"{key}: {err}")
            continue
        if outline is None:
            failed.append(f"{key}: no visible ink")
            continue
        if key not in mapping:
            if next_cp > LAST_CODEPOINT:
                raise SystemExit("Private use area exhausted")
            mapping[key] = next_cp
            next_cp += 1
        cp = mapping[key]
        name = f"u{cp:04X}"
        glyphs[name] = glyph_from(*outline)
        cmap[cp] = name

    order = [".notdef", "space", *sorted(glyphs, key=lambda n: int(n[1:], 16))]
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: "space", **cmap})
    empty = TTGlyphPen(None).glyph()
    fb.setupGlyf({".notdef": empty, "space": empty, **glyphs})
    glyf = fb.font["glyf"]
    metrics = {}
    for g in order:
        glyf[g].recalcBounds(glyf)
        metrics[g] = (UPM, getattr(glyf[g], "xMin", 0))
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=UPM, descent=0)
    fb.setupNameTable({"familyName": "NSPanel Homey Icons", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=UPM, sTypoDescender=0, sTypoLineGap=0, usWinAscent=UPM, usWinDescent=0)
    fb.setupPost()

    out_ttf = ROOT / "tft/fonts/NSPanelHomeyIcons.ttf"
    fb.save(str(out_ttf))
    woff = TTFont(str(out_ttf))
    woff.flavor = "woff2"
    woff.save(str(ROOT / "settings/homey-icons.woff2"))

    live = {k: cp for k, cp in mapping.items() if cp in cmap}
    MAP_FILE.write_text(json.dumps(dict(sorted(mapping.items(), key=lambda kv: kv[1])), indent=0) + "\n")
    (ROOT / "lib/homeyIcons.json").write_text(json.dumps({k: chr(cp) for k, cp in sorted(live.items())}, ensure_ascii=False) + "\n")
    (ROOT / "tft/fonts/homey-icons-chars.txt").write_text("".join(chr(cp) for cp in sorted(cmap)), encoding="utf-8")

    print(f"{len(cmap)} icons in font, {len(failed)} skipped")
    for line in failed[:20]:
        print("  skipped:", line)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1:])
