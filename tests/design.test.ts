import { describe, expect, test } from 'bun:test';
import {
  COVER, H, PAGES, PICTURES, SAFE_RIGHT, W,
} from '../design/layout';

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layout', () => {
  test('page ids are 0..8 in order (media 7, timer 8 appended)', () => {
    expect(PAGES.map((p) => [p.id, p.name])).toEqual([
      [0, 'boot'], [1, 'home'], [2, 'moods'], [3, 'climate'], [4, 'calendar'], [5, 'notification'], [6, 'screensaver'], [7, 'media'], [8, 'timer'],
    ]);
  });

  test('pictures: existing order kept, new ones appended', () => {
    expect([...PICTURES]).toEqual(['boot', 'home', 'moods', 'moods-on', 'climate', 'calendar', 'notification', 'screensaver', 'home-on', 'media', 'media-bare', 'timer']);
  });

  test('cover area is exactly 96x96 and only cover_ic sits on it', () => {
    const media = PAGES.find((p) => p.name === 'media')!;
    expect([COVER.w, COVER.h]).toEqual([96, 96]);
    expect(media.components.filter((c) => c.name !== 'cover_ic' && overlaps(c, COVER)).map((c) => c.name)).toEqual([]);
    expect(media.components.find((c) => c.name === 'cover_ic')).toMatchObject({ x: COVER.x, y: COVER.y, w: 96, h: 96 });
  });

  test('home: five nav buttons; nav_med sits exactly on the media button; variants defined', () => {
    const home = PAGES.find((p) => p.name === 'home')!;
    expect(home.buttons.map((b) => b.icon)).toEqual(['palette-outline', 'thermostat', 'music', 'timer-outline', 'calendar-month-outline']);
    const music = home.buttons.find((b) => b.icon === 'music')!;
    expect(home.components.find((c) => c.name === 'nav_med')).toMatchObject({ x: music.x, y: music.y, w: music.d, h: music.d });
    expect(home.variants).toEqual([{ suffix: 'on', amberButtons: ['music'] }]);
    expect(PAGES.find((p) => p.name === 'media')!.variants).toEqual([{ suffix: 'bare', hideButtons: ['skip-previous', 'skip-next'] }]);
    expect(PAGES.find((p) => p.name === 'moods')!.variants).toEqual([{ suffix: 'on', amberCards: true }]);
  });

  test('media progress bars are progress components', () => {
    const media = PAGES.find((p) => p.name === 'media')!;
    expect(media.components.filter((c) => c.kind === 'progress').map((c) => c.name)).toEqual(['prog', 'vol']);
  });

  test('every component and hotspot is inside the screen', () => {
    for (const p of PAGES) {
      for (const c of [...p.components, ...p.hotspots]) {
        expect({ page: p.name, name: c.name, ok: c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H })
          .toEqual({ page: p.name, name: c.name, ok: true });
      }
    }
  });

  test('everything visible stays left of the bezel (x <= SAFE_RIGHT)', () => {
    expect(SAFE_RIGHT).toBe(454);
    for (const p of PAGES) {
      const items = [...p.components, ...p.hotspots, ...p.cards].map((c) => ({ name: 'name' in c ? c.name : 'card', right: c.x + c.w }));
      items.push(...p.buttons.map((b) => ({ name: `button:${b.icon}`, right: b.x + b.d })));
      expect(items.filter((i) => i.right > SAFE_RIGHT).map((i) => `${p.name}.${i.name}`)).toEqual([]);
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

  test('chips and tile icons use the Homey icon font; weather stays on the MDI font', () => {
    const font = (page: string, name: string) => PAGES.find((p) => p.name === page)!.components.find((c) => c.name === name)!.font;
    expect([font('home', 'chips'), font('moods', 'i01'), font('moods', 'i08'), font('home', 'wx_icon')]).toEqual(['F_HICON_S', 'F_HICON_L', 'F_HICON_L', 'F_ICON_L']);
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
