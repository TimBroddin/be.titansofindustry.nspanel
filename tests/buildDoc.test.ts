import { describe, expect, test } from 'bun:test';
import { PAGES } from '../design/layout';

const build = await Bun.file('tft/BUILD.md').text();
const codeBlocks = [...build.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);

describe('tft/BUILD.md', () => {
  test('every Preinitialize snippet ends with sendme (firmware learns the page from it)', () => {
    const preinits = codeBlocks.filter((c) => /^dim=(brightness|ss_dim)/m.test(c) && !/\bpage \w/.test(c)); // not the WAKE touch script
    expect(preinits.length).toBeGreaterThanOrEqual(2);
    for (const c of preinits) expect(c.trim().endsWith('sendme')).toBe(true);
  });

  test('no one-line if blocks (Nextion needs braces on their own lines)', () => {
    for (const c of codeBlocks) expect(c).not.toMatch(/if\(.*\)\s*\{.*\}/);
    expect(build).not.toMatch(/`if\([^`]*\{[^`]*\}`/);
  });
});

describe('layout names', () => {
  test('no component or hotspot is named like a page (would shadow `page <name>`)', () => {
    const pageNames = new Set(PAGES.map((p) => p.name));
    for (const p of PAGES) {
      expect([...p.components, ...p.hotspots].map((c) => c.name).filter((n) => pageNames.has(n))).toEqual([]);
    }
  });
});
