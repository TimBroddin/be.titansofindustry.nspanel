import {
  COLORS, FONT_SPECS, H, Page, Variant, W,
} from './layout';
import homeyIcons from '../lib/homeyIcons.json';
import mdi from './mdi-codepoints.json';

export type Mode = 'bg' | 'preview';

const FONT_CSS: Record<string, string> = {
  'Inter ExtraLight': "font-family: 'InterX'; font-weight: 200;",
  'Inter Light': "font-family: 'InterL'; font-weight: 300;",
  'Inter Regular': "font-family: 'InterR'; font-weight: 400;",
  'Inter Medium': "font-family: 'InterM'; font-weight: 500;",
  'MDI (Blackymas)': "font-family: 'MDI'; font-weight: 400;",
  'NSPanel Homey Glyphs': "font-family: 'HomeyGlyphs'; font-weight: 400;",
};

// Previews draw icon samples with the panel's real icon fonts: layout samples are emoji (readable in the
// layout source), mapped here to a Homey icon key or an MDI icon name.
const PREVIEW_ICONS: Record<string, { homey?: string; mdi?: string }> = {
  '🎬': { homey: 'device-icons/com.basmilius.apple/apple-tv' },
  '🍽': { homey: 'homey-vectors/cloud.shelly/light_bulb' },
  '🌴': { homey: 'device-icons/com.sonos/cloud' },
  '🎨': { homey: 'device-icons/nl.philips.hue/bulb' },
  '💡': { homey: 'homey-vectors/cloud.shelly/light_bulb' },
  '🌙': { homey: 'homey-vectors/com.xiaomi-miio/light_bedsidelight' },
  '🚪': { homey: 'homey-vectors/com.abus/sensor_door' },
  '⏻': { homey: 'homey-vectors/media/power' },
  '♫': { homey: 'device-icons/com.sonos/cloud' },
  '☁': { mdi: 'weather-cloudy' },
  '⏸': { mdi: 'pause' },
};

const previewSample = (sample: string): string => [...sample].map((ch) => {
  const icon = PREVIEW_ICONS[ch];
  if (icon?.homey) {
    const g = (homeyIcons as Record<string, string>)[icon.homey];
    if (!g) throw new Error(`Unknown Homey icon ${icon.homey}`);
    return g;
  }
  return icon?.mdi ? String.fromCodePoint(parseInt((mdi as Record<string, string>)[icon.mdi], 16)) : ch;
}).join('');

const glyph = (name: string): string => {
  if (!name) return '';
  const cp = (mdi as Record<string, string>)[name];
  if (!cp) throw new Error(`Unknown MDI icon ${name}`);
  return `&#x${cp};`;
};

const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

// variant: render one of the page's crop-source pictures (amber cards/buttons, or buttons left out).
export function renderPage(page: Page, mode: Mode, fontDir: string, variant?: Variant): string {
  const cards = page.cards.map((c) => {
    const tint = c.tint === 'amber' || variant?.amberCards;
    return `<div class="card${tint ? ' amber' : ''}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r ?? 18}px"></div>`;
  }).join('');
  const buttons = page.buttons
    .filter((b) => !variant?.hideButtons?.includes(b.icon))
    .map((b) => {
      const amber = b.tint === 'amber' || variant?.amberButtons?.includes(b.icon);
      return `<div class="btn${amber ? ' amber' : ''}" style="left:${b.x}px;top:${b.y}px;width:${b.d}px;height:${b.d}px;font-size:${Math.round(b.d * 0.45)}px">${glyph(b.icon)}</div>`;
    }).join('');
  const labels = (page.labels ?? []).map((l) => `<div class="txt" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;color:${COLORS[l.color]};font-size:${l.px}px;${FONT_CSS['Inter Regular']}justify-content:center;align-items:center">${esc(l.text)}</div>`).join('');
  const texts = mode !== 'preview' ? '' : page.components.map((c) => {
    if (c.kind === 'progress') {
      const pct = Number(c.sample) || 0;
      return `<div style="position:absolute;left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${COLORS[c.bco ?? 'track']};border-radius:${c.h / 2}px"><div style="width:${pct}%;height:100%;background:${COLORS[c.color]};border-radius:${c.h / 2}px"></div></div>`;
    }
    const f = FONT_SPECS[c.font];
    const justify = { left: 'flex-start', center: 'center', right: 'flex-end' }[c.align];
    const align = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[c.valign ?? 'center'];
    return `<div class="txt" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;color:${COLORS[c.color]};font-size:${f.px}px;${FONT_CSS[f.family]}justify-content:${justify};align-items:${align};white-space:${c.wrap ? 'normal' : 'nowrap'}">${esc(previewSample(c.sample))}</div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'InterX'; src: url('${fontDir}/Inter-ExtraLight.ttf'); }
    @font-face { font-family: 'InterL'; src: url('${fontDir}/Inter-Light.ttf'); }
    @font-face { font-family: 'InterR'; src: url('${fontDir}/Inter-Regular.ttf'); }
    @font-face { font-family: 'InterM'; src: url('${fontDir}/Inter-Medium.ttf'); }
    @font-face { font-family: 'MDI'; src: url('${fontDir}/materialdesignicons-webfont.ttf'); }
    @font-face { font-family: 'HomeyGlyphs'; src: url('${fontDir}/../../tft/fonts/NSPanelHomeyGlyphs.ttf'); }
    html, body { margin: 0; padding: 0; }
    .pg { width: ${W}px; height: ${H}px; position: relative; overflow: hidden;
          background: radial-gradient(120% 90% at 0% 0%, #1d1f23 0%, #141518 55%, #0f1012 100%); }
    .card { position: absolute; box-sizing: border-box; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.09); }
    .card.amber { background: rgba(242,181,107,.18); border-color: rgba(242,181,107,.45); }
    .btn { position: absolute; box-sizing: border-box; border-radius: 50%; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
           display: flex; align-items: center; justify-content: center; font-family: 'MDI'; color: #c9d4e6; line-height: 1; }
    .btn.amber { background: rgba(242,181,107,.18); border-color: rgba(242,181,107,.45); color: #f6c88f; }
    .txt { position: absolute; display: flex; overflow: hidden; line-height: 1.15; letter-spacing: 0; }
  </style></head><body><div class="pg">${cards}${buttons}${labels}${texts}</div></body></html>`;
}
