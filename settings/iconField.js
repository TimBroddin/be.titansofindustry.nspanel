'use strict';

// Shared by settings/index.html (browser global) and tests (CommonJS).
// Icons are stored as glyphs; the text field shows the MDI name, or U+XXXX for glyphs not in the map.

function iconLabel(glyph, glyphToName) {
  if (!glyph) return '';
  return glyphToName[glyph] || `U+${glyph.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

function resolveIcon(input, icons) {
  const value = String(input || '').trim();
  if (!value) return { glyph: '' };
  if (Object.prototype.hasOwnProperty.call(icons, value)) return { glyph: icons[value] };
  const codepoint = /^U\+([0-9A-F]{4,5})$/i.exec(value);
  if (codepoint) return { glyph: String.fromCodePoint(parseInt(codepoint[1], 16)) };
  return { error: `Unknown icon "${value}"` };
}

if (typeof module !== 'undefined') module.exports = { iconLabel, resolveIcon };
