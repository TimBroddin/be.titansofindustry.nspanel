'use strict';

// Builds what the settings preview draws for a panel page, from settings/layout.json and the
// config being edited. Shared by settings/index.html (browser global) and tests (CommonJS).
// ctx: { time, date, labels: { inside, next, moods }, display(glyph) -> char, iconChar(name) -> char }

const SAMPLE = {
  wx_temp: '13°', wx_hilo: 'max 16° · min 8°', in_cur: '21,5°', nx1_t: '18:00', nx1: 'Zwemles', nx2: 'morgen 08:30 Tandarts',
};

function homeText(name, config, ctx) {
  switch (name) {
    case 'time': return ctx.time;
    case 'date': return ctx.date;
    case 'wx_icon': return ctx.iconChar('weather-partly-cloudy');
    case 'chips': return (config.home.chips || []).filter(Boolean).map((c) => ctx.display(c.icon)).filter(Boolean).join(' ');
    case 'in_lbl': return ctx.labels.inside;
    case 'nx_lbl': return ctx.labels.next;
    case 'in_tgt': return config.home.thermostat ? '» 20,0°' : '';
    default: return SAMPLE[name] || '';
  }
}

function moodsText(name, config, ctx) {
  if (name === 'title') return ctx.labels.moods;
  const m = /^([il])(\d\d)$/.exec(name);
  if (!m) return '';
  const tile = (config.moods || [])[Number(m[2]) - 1];
  if (!tile) return '';
  return m[1] === 'i' ? ctx.display(tile.icon) : tile.label;
}

function previewItems(page, layout, config, ctx) {
  const p = layout.pages[page];
  return p.components.map((c) => ({
    name: c.name,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    px: layout.fontPx[c.font],
    color: layout.colors[c.color],
    align: c.align,
    valign: c.valign,
    wrap: c.wrap,
    icon: c.font.startsWith('F_ICON'),
    weight: c.font === 'F_CLOCK' || c.font === 'F_HUGE' ? 200 : (c.font === 'F_BIG' ? 300 : (c.font === 'F_TITLE' ? 500 : 400)), // eslint-disable-line no-nested-ternary
    text: page === 'home' ? homeText(c.name, config, ctx) : moodsText(c.name, config, ctx),
  }));
}

if (typeof module !== 'undefined') module.exports = { previewItems };
