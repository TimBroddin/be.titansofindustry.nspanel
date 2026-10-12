import { describe, expect, test } from 'bun:test';
import { componentsMarkdown, rgb565 } from '../design/components';

describe('Nextion component export', () => {
  test('rgb565 matches the plan constants', () => {
    expect(rgb565('#e9eef7')).toBe(61310);
    expect(rgb565('#9fb0cc')).toBe(40345);
    expect(rgb565('#f2b56b')).toBe(62893);
  });

  test('tft/COMPONENTS.md is generated from the layout and up to date', async () => {
    expect(await Bun.file('tft/COMPONENTS.md').text()).toBe(componentsMarkdown());
  });

  test('every moods tile component lists its touch script', () => {
    const md = componentsMarkdown();
    expect(md).toContain('| i01 | Text |');
    expect(md).toMatch(/\| l08 \| Text \|.*TILE_08/);
  });
});
