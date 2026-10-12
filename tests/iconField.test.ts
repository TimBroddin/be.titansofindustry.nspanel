import { describe, expect, test } from 'bun:test';

const { iconLabel, resolveIcon } = require('../settings/iconField.js');

const icons = { lightbulb: '' };
const glyphToName = { '': 'lightbulb' };

describe('icon field', () => {
  test('known glyphs show their name and resolve back', () => {
    expect(iconLabel('', glyphToName)).toBe('lightbulb');
    expect(resolveIcon('lightbulb', icons)).toEqual({ glyph: '' });
  });

  test('unknown stored glyphs survive a save round-trip', () => {
    const label = iconLabel('', glyphToName);
    expect(label).toBe('U+E335');
    expect(resolveIcon(label, icons)).toEqual({ glyph: '' });
  });

  test('empty clears, unknown names are an error instead of a silent blank', () => {
    expect(resolveIcon('  ', icons)).toEqual({ glyph: '' });
    expect(resolveIcon('lightbul', icons)).toEqual({ error: 'Unknown icon "lightbul"' });
  });
});
