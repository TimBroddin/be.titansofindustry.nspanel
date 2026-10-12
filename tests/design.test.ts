import { describe, expect, test } from 'bun:test';
import { H, PAGES, PICTURES, W } from '../design/layout';

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layout', () => {
  test('page ids are 0..6 in order', () => {
    expect(PAGES.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('every component and hotspot is inside the screen', () => {
    for (const p of PAGES) {
      for (const c of [...p.components, ...p.hotspots]) {
        expect({ page: p.name, name: c.name, ok: c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H })
          .toEqual({ page: p.name, name: c.name, ok: true });
      }
    }
  });

  test('no two text components on a page overlap (crop images would erase each other)', () => {
    for (const p of PAGES) {
      const cs = p.components;
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          expect({ page: p.name, pair: `${cs[i].name}/${cs[j].name}`, overlap: overlaps(cs[i], cs[j]) })
            .toEqual({ page: p.name, pair: `${cs[i].name}/${cs[j].name}`, overlap: false });
        }
      }
    }
  });

  test('component names are unique per page and at most 14 chars (Nextion limit)', () => {
    for (const p of PAGES) {
      const names = [...p.components, ...p.hotspots].map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.filter((n) => n.length > 14)).toEqual([]);
    }
  });
});

describe('exported art', () => {
  test('every picture exists and is exactly 480x320', async () => {
    for (const name of PICTURES) {
      const buf = Buffer.from(await Bun.file(`tft/assets/${name}.png`).arrayBuffer());
      expect(buf.subarray(1, 4).toString()).toBe('PNG');
      expect({ name, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }).toEqual({ name, w: W, h: H });
    }
  });
});
