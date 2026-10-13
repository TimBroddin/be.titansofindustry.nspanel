import { describe, expect, test } from 'bun:test';
import { componentsMarkdown, rgb565 } from '../design/components';
import { round2Markdown } from '../design/round2';

describe('Nextion component export', () => {
  test('rgb565 matches the plan constants', () => {
    expect(rgb565('#e9eef7')).toBe(61310);
    expect(rgb565('#9fb0cc')).toBe(40345);
    expect(rgb565('#f2b56b')).toBe(62893);
  });

  test('tft/COMPONENTS.md is generated from the layout and up to date', async () => {
    expect(await Bun.file('tft/COMPONENTS.md').text()).toBe(componentsMarkdown());
  });

  test('tft/ROUND2.md is generated and up to date', async () => {
    expect(await Bun.file('tft/ROUND2.md').text()).toBe(round2Markdown());
  });

  test('ROUND2.md: compared with the TFT on the panel (built-r1), lists additions, new pages, pictures and scripts', () => {
    const md = round2Markdown();
    expect(md).toMatch(/\| tmr \| Text \| \*\*add\*\*/);
    expect(md).toMatch(/\| nav_med \| Text \| \*\*add\*\*/);
    expect(md).toMatch(/\| nav_timer \| Hotspot \| \*\*add\*\*/);
    expect(md).toMatch(/\| chips \| Text \|.*font → \*\*F_HICON_S\*\*/);
    expect(md).toMatch(/\| t01 \| Text \|.*font → \*\*F_BODY\*\*/);
    expect(md).toContain('Page 7 `media`');
    expect(md).toContain('Page 8 `timer`');
    expect(md).toContain('p_home_on=56,p_media=57,p_media_bare=58,p_timer=59');
    for (const script of ['NAV_MEDIA', 'NAV_TIMER', 'MEDIA_TOGGLE', 'MEDIA_PLAYER', 'TIMER_ADD_300', 'TIMER_ACT']) expect(md).toContain(script);
  });

  test('every moods tile component lists its touch script', () => {
    const md = componentsMarkdown();
    expect(md).toContain('| i01 | Text |');
    expect(md).toMatch(/\| l08 \| Text \|.*TILE_08/);
  });
});
