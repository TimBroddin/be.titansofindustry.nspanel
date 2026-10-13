// Generates settings/layout.json (the subset of design/layout.ts the settings preview needs).
// Usage: bun design/settingsLayout.ts
import {
  COLORS, FONT_SPECS, H, PAGES, W,
} from './layout';

function page(name: string) {
  const p = PAGES.find((x) => x.name === name);
  if (!p) throw new Error(`No page ${name}`);
  return {
    cards: p.cards,
    buttons: p.buttons,
    components: p.components.map((c) => ({
      name: c.name, x: c.x, y: c.y, w: c.w, h: c.h, font: c.font, color: c.color, align: c.align, valign: c.valign ?? 'center', wrap: Boolean(c.wrap),
    })),
  };
}

export function settingsLayout() {
  return {
    W,
    H,
    colors: COLORS,
    fontPx: Object.fromEntries(Object.entries(FONT_SPECS).map(([k, v]) => [k, v.px])),
    pages: { home: page('home'), moods: page('moods') },
  };
}

if (import.meta.main) {
  await Bun.write('settings/layout.json', `${JSON.stringify(settingsLayout(), null, 1)}\n`);
  console.log('wrote settings/layout.json');
}
