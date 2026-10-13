import { COLORS, FONT_SPECS, H, Page, W } from './layout';
import mdi from './mdi-codepoints.json';

export type Mode = 'bg' | 'on' | 'preview';

const FONT_CSS: Record<string, string> = {
  'Inter ExtraLight': "font-family: 'InterX'; font-weight: 200;",
  'Inter Light': "font-family: 'InterL'; font-weight: 300;",
  'Inter Regular': "font-family: 'InterR'; font-weight: 400;",
  'Inter Medium': "font-family: 'InterM'; font-weight: 500;",
  'MDI (Blackymas)': "font-family: -apple-system, 'Apple Color Emoji'; font-weight: 400;",
};

const glyph = (name: string): string => {
  const cp = (mdi as Record<string, string>)[name];
  if (!cp) throw new Error(`Unknown MDI icon ${name}`);
  return `&#x${cp};`;
};

const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

export function renderPage(page: Page, mode: Mode, fontDir: string): string {
  const amberCards = mode === 'on';
  const cards = page.cards.map((c) => {
    const tint = c.tint === 'amber' || amberCards;
    return `<div class="card${tint ? ' amber' : ''}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r ?? 18}px"></div>`;
  }).join('');
  const buttons = page.buttons.map((b) => `<div class="btn${b.tint === 'amber' ? ' amber' : ''}" style="left:${b.x}px;top:${b.y}px;width:${b.d}px;height:${b.d}px;font-size:${Math.round(b.d * 0.45)}px">${glyph(b.icon)}</div>`).join('');
  const texts = mode !== 'preview' ? '' : page.components.map((c) => {
    const f = FONT_SPECS[c.font];
    const justify = { left: 'flex-start', center: 'center', right: 'flex-end' }[c.align];
    const align = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[c.valign ?? 'center'];
    return `<div class="txt" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;color:${COLORS[c.color]};font-size:${f.px}px;${FONT_CSS[f.family]}justify-content:${justify};align-items:${align};white-space:${c.wrap ? 'normal' : 'nowrap'}">${esc(c.sample)}</div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'InterX'; src: url('${fontDir}/Inter-ExtraLight.ttf'); }
    @font-face { font-family: 'InterL'; src: url('${fontDir}/Inter-Light.ttf'); }
    @font-face { font-family: 'InterR'; src: url('${fontDir}/Inter-Regular.ttf'); }
    @font-face { font-family: 'InterM'; src: url('${fontDir}/Inter-Medium.ttf'); }
    @font-face { font-family: 'MDI'; src: url('${fontDir}/materialdesignicons-webfont.ttf'); }
    html, body { margin: 0; padding: 0; }
    .pg { width: ${W}px; height: ${H}px; position: relative; overflow: hidden;
          background: radial-gradient(120% 90% at 0% 0%, #1d1f23 0%, #141518 55%, #0f1012 100%); }
    .card { position: absolute; box-sizing: border-box; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.09); }
    .card.amber { background: rgba(242,181,107,.18); border-color: rgba(242,181,107,.45); }
    .btn { position: absolute; box-sizing: border-box; border-radius: 50%; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
           display: flex; align-items: center; justify-content: center; font-family: 'MDI'; color: #c9d4e6; line-height: 1; }
    .btn.amber { background: rgba(242,181,107,.18); border-color: rgba(242,181,107,.45); color: #f6c88f; }
    .txt { position: absolute; display: flex; overflow: hidden; line-height: 1.15; letter-spacing: 0; }
  </style></head><body><div class="pg">${cards}${buttons}${texts}</div></body></html>`;
}
