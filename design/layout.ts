// Single source of truth for the Soft dark TFT: page art (cards, buttons) and the Nextion
// components placed on top. Used by design/render.ts (PNG art), design/components.ts
// (tft/COMPONENTS.md) and the app's view tests (component names).

export const W = 480;
export const H = 320;

export const COLORS = {
  text: '#e9eef7',
  muted: '#9fb0cc',
  amber: '#f2b56b',
} as const;

export type ColorName = keyof typeof COLORS;

// Symbolic Nextion fonts; numeric ids live in tft/ids.json once generated in the Editor.
export type FontName = 'F_CLOCK' | 'F_HUGE' | 'F_BIG' | 'F_BODY' | 'F_SMALL' | 'F_TITLE' | 'F_ICON_S' | 'F_ICON_L';

export const FONT_SPECS: Record<FontName, { family: string; px: number; chars: string; note: string }> = {
  F_CLOCK: { family: 'Inter ExtraLight', px: 80, chars: '0123456789: APM', note: 'home + screensaver clock' },
  F_HUGE: { family: 'Inter ExtraLight', px: 84, chars: '0123456789,.°-', note: 'climate target' },
  F_BIG: { family: 'Inter Light', px: 32, chars: 'ISO-8859-1', note: 'temperatures' },
  F_BODY: { family: 'Inter Regular', px: 17, chars: 'ISO-8859-1', note: 'body, tile labels, event titles' },
  F_SMALL: { family: 'Inter Regular', px: 13, chars: 'ISO-8859-1', note: 'secondary lines, caps labels' },
  F_TITLE: { family: 'Inter Medium', px: 22, chars: 'ISO-8859-1', note: 'page titles' },
  F_ICON_S: { family: 'MDI (Blackymas)', px: 24, chars: 'icon font from Blackymas HMI', note: 'chips' },
  F_ICON_L: { family: 'MDI (Blackymas)', px: 32, chars: 'icon font from Blackymas HMI', note: 'weather, tiles' },
};

export type Align = 'left' | 'center' | 'right';

export interface Component {
  name: string;
  x: number; y: number; w: number; h: number;
  font: FontName;
  color: ColorName;
  align: Align;
  valign?: 'top' | 'center' | 'bottom';
  wrap?: boolean;
  crop: 'bg' | 'on'; // crop image: the page background, or the page's "on" variant
  touch?: string; // name of the touch script in tft/BUILD.md
  sample: string; // preview text
}

export interface Hotspot { name: string; x: number; y: number; w: number; h: number; touch: string }

export interface Card { x: number; y: number; w: number; h: number; r?: number; tint?: 'amber' }
export interface RoundButton { x: number; y: number; d: number; icon: string; tint?: 'amber' }

export interface Page {
  id: number;
  name: string;
  cards: Card[];
  buttons: RoundButton[];
  components: Component[];
  hotspots: Hotspot[];
  hasOnVariant?: boolean; // export <page>-on.png with every card tinted amber (tile "on" crop source)
}

const titleAndHome = (sample: string): { components: Component[]; buttons: RoundButton[]; hotspots: Hotspot[] } => ({
  components: [{ name: 'title', x: 20, y: 12, w: 300, h: 32, font: 'F_TITLE', color: 'text', align: 'left', valign: 'center', crop: 'bg', sample }],
  buttons: [{ x: 426, y: 12, d: 36, icon: 'home-outline' }],
  hotspots: [{ name: 'home', x: 416, y: 4, w: 60, h: 52, touch: 'GOTO_HOME' }],
});

// ---- home ----
const home: Page = {
  id: 1,
  name: 'home',
  cards: [
    { x: 20, y: 160, w: 214, h: 84 },
    { x: 246, y: 160, w: 214, h: 84 },
  ],
  buttons: [
    { x: 168, y: 262, d: 44, icon: 'palette-outline' },
    { x: 218, y: 262, d: 44, icon: 'thermostat' },
    { x: 268, y: 262, d: 44, icon: 'calendar-month-outline' },
  ],
  components: [
    { name: 'time', x: 18, y: 14, w: 236, h: 88, font: 'F_CLOCK', color: 'text', align: 'left', valign: 'center', crop: 'bg', sample: '13:42' },
    { name: 'date', x: 24, y: 104, w: 230, h: 26, font: 'F_BODY', color: 'muted', align: 'left', valign: 'center', crop: 'bg', sample: 'maandag 12 oktober' },
    { name: 'wx_icon', x: 300, y: 20, w: 48, h: 48, font: 'F_ICON_L', color: 'muted', align: 'center', valign: 'center', crop: 'bg', sample: '☁' },
    { name: 'wx_temp', x: 348, y: 20, w: 112, h: 48, font: 'F_BIG', color: 'text', align: 'right', valign: 'center', crop: 'bg', sample: '13°' },
    { name: 'wx_hilo', x: 300, y: 70, w: 160, h: 22, font: 'F_SMALL', color: 'muted', align: 'right', valign: 'center', crop: 'bg', sample: '↑16° ↓8°' },
    { name: 'chips', x: 258, y: 100, w: 202, h: 36, font: 'F_ICON_S', color: 'amber', align: 'right', valign: 'center', crop: 'bg', sample: '💡  🚪' },
    { name: 'in_lbl', x: 36, y: 170, w: 182, h: 18, font: 'F_SMALL', color: 'muted', align: 'left', valign: 'center', crop: 'bg', sample: 'BINNEN' },
    { name: 'in_cur', x: 36, y: 190, w: 104, h: 44, font: 'F_BIG', color: 'text', align: 'left', valign: 'center', crop: 'bg', sample: '21,5°' },
    { name: 'in_tgt', x: 140, y: 198, w: 86, h: 30, font: 'F_SMALL', color: 'amber', align: 'left', valign: 'center', crop: 'bg', sample: '→ 20,0°' },
    { name: 'nx_lbl', x: 262, y: 170, w: 182, h: 18, font: 'F_SMALL', color: 'muted', align: 'left', valign: 'center', crop: 'bg', sample: 'STRAKS' },
    { name: 'nx1_t', x: 262, y: 194, w: 54, h: 24, font: 'F_BODY', color: 'amber', align: 'left', valign: 'center', crop: 'bg', sample: '18:00' },
    { name: 'nx1', x: 318, y: 194, w: 136, h: 24, font: 'F_BODY', color: 'text', align: 'left', valign: 'center', crop: 'bg', sample: 'Zwemles' },
    { name: 'nx2', x: 262, y: 220, w: 192, h: 20, font: 'F_SMALL', color: 'muted', align: 'left', valign: 'center', crop: 'bg', sample: 'morgen 08:30 Tandarts' },
  ],
  hotspots: [
    { name: 'go_climate', x: 20, y: 160, w: 214, h: 84, touch: 'NAV_CLIMATE' },
    { name: 'go_cal', x: 246, y: 160, w: 214, h: 84, touch: 'NAV_CALENDAR' },
    { name: 'nav_moods', x: 162, y: 256, w: 56, h: 60, touch: 'NAV_MOODS' },
    { name: 'nav_climate', x: 218, y: 256, w: 50, h: 60, touch: 'NAV_CLIMATE' },
    { name: 'nav_cal', x: 268, y: 256, w: 56, h: 60, touch: 'NAV_CALENDAR' },
  ],
};

// ---- moods ----
export const TILE_COLS = [18, 131, 244, 357];
export const TILE_ROWS = [64, 188];
export const TILE_W = 104;
export const TILE_H = 112;
const tiles: Card[] = [];
const tileComponents: Component[] = [];
const MOOD_SAMPLES = [['🎬', 'Film'], ['🍽', 'Eten'], ['🌴', 'Hawaii'], ['🎨', 'Kleurrijk'], ['💡', 'Keukenlicht'], ['🌙', 'Slapen'], ['🚪', 'Weg'], ['⏻', 'Alles uit']];
TILE_ROWS.forEach((y, r) => TILE_COLS.forEach((x, c) => {
  const n = String(r * 4 + c + 1).padStart(2, '0');
  const [icon, label] = MOOD_SAMPLES[r * 4 + c];
  tiles.push({ x, y, w: TILE_W, h: TILE_H });
  tileComponents.push(
    { name: `i${n}`, x: x + 8, y: y + 8, w: TILE_W - 16, h: 46, font: 'F_ICON_L', color: 'text', align: 'left', valign: 'center', crop: 'bg', touch: `TILE_${n}`, sample: icon },
    { name: `l${n}`, x: x + 8, y: y + 56, w: TILE_W - 16, h: TILE_H - 64, font: 'F_BODY', color: 'text', align: 'left', valign: 'bottom', wrap: true, crop: 'bg', touch: `TILE_${n}`, sample: label },
  );
}));
const moodsTop = titleAndHome('Sferen');
const moods: Page = {
  id: 2,
  name: 'moods',
  cards: tiles,
  buttons: moodsTop.buttons,
  components: [...moodsTop.components, ...tileComponents],
  hotspots: moodsTop.hotspots,
  hasOnVariant: true,
};

// ---- climate ----
const climateTop = titleAndHome('Klimaat');
const climate: Page = {
  id: 3,
  name: 'climate',
  cards: [{ x: 18, y: 232, w: 444, h: 70 }],
  buttons: [
    ...climateTop.buttons,
    { x: 40, y: 96, d: 76, icon: 'minus' },
    { x: 364, y: 96, d: 76, icon: 'plus', tint: 'amber' },
  ],
  components: [
    ...climateTop.components,
    { name: 'tgt_lbl', x: 140, y: 62, w: 200, h: 18, font: 'F_SMALL', color: 'muted', align: 'center', valign: 'center', crop: 'bg', sample: 'DOEL' },
    { name: 'tgt_txt', x: 124, y: 80, w: 232, h: 100, font: 'F_HUGE', color: 'text', align: 'center', valign: 'center', crop: 'bg', sample: '20,0°' },
    { name: 'status', x: 40, y: 184, w: 400, h: 26, font: 'F_BODY', color: 'amber', align: 'center', valign: 'center', crop: 'bg', sample: '● Verwarmen · nu 21,5°' },
    { name: 'room_lbl', x: 36, y: 242, w: 250, h: 18, font: 'F_SMALL', color: 'muted', align: 'left', valign: 'center', crop: 'bg', sample: 'WOONKAMER' },
    { name: 'room', x: 36, y: 262, w: 260, h: 26, font: 'F_BODY', color: 'text', align: 'left', valign: 'center', crop: 'bg', sample: 'Netatmo thermostaat' },
    { name: 'info', x: 300, y: 242, w: 148, h: 46, font: 'F_SMALL', color: 'muted', align: 'right', valign: 'center', wrap: true, crop: 'bg', sample: 'buiten 13° vochtigheid 48%' },
  ],
  hotspots: [
    ...climateTop.hotspots,
    { name: 'minus', x: 30, y: 86, w: 96, h: 96, touch: 'TARGET_MINUS' },
    { name: 'plus', x: 354, y: 86, w: 96, h: 96, touch: 'TARGET_PLUS' },
  ],
};

// ---- calendar ----
export const CAL_ROWS = 8;
const CAL_SAMPLES: Array<[string, string, ColorName?]> = [
  ['VANDAAG', ''], ['18:00', 'Zwemles'], ['20:30', 'Oudercontact'], ['MORGEN', ''],
  ['08:30', 'Tandarts'], ['hele dag', 'Oma jarig', 'muted'], ['DO 15 OKT', ''], ['19:00', 'Etentje bij Jan en Lies'],
];
const calTop = titleAndHome('Agenda');
const calRows: Component[] = [];
for (let i = 0; i < CAL_ROWS; i++) {
  const n = String(i + 1).padStart(2, '0');
  const y = 56 + i * 32;
  const [t, e] = CAL_SAMPLES[i];
  const header = e === '' ;
  calRows.push(
    { name: `t${n}`, x: 20, y, w: 74, h: 30, font: header ? 'F_SMALL' : 'F_BODY', color: header ? 'muted' : (CAL_SAMPLES[i][2] ?? 'amber'), align: 'left', valign: 'center', crop: 'bg', sample: t },
    { name: `e${n}`, x: 96, y, w: 364, h: 30, font: 'F_BODY', color: 'text', align: 'left', valign: 'center', crop: 'bg', sample: e },
  );
}
const calendar: Page = {
  id: 4,
  name: 'calendar',
  cards: [],
  buttons: calTop.buttons,
  components: [...calTop.components, ...calRows],
  hotspots: calTop.hotspots,
};

// ---- notification ----
const notification: Page = {
  id: 5,
  name: 'notification',
  cards: [{ x: 40, y: 34, w: 400, h: 252 }, { x: 180, y: 234, w: 120, h: 38, r: 19, tint: 'amber' }],
  buttons: [],
  components: [
    { name: 'heading', x: 60, y: 50, w: 360, h: 34, font: 'F_TITLE', color: 'text', align: 'left', valign: 'center', crop: 'bg', sample: 'Wasmachine klaar' },
    { name: 'body', x: 60, y: 90, w: 360, h: 134, font: 'F_BODY', color: 'muted', align: 'left', valign: 'top', wrap: true, crop: 'bg', sample: 'De was is klaar om op te hangen.' },
    { name: 'close_lbl', x: 184, y: 238, w: 112, h: 30, font: 'F_BODY', color: 'amber', align: 'center', valign: 'center', crop: 'bg', touch: 'CLOSE', sample: 'Sluiten' },
  ],
  hotspots: [{ name: 'close', x: 170, y: 226, w: 140, h: 54, touch: 'CLOSE' }],
};

// ---- screensaver ----
const screensaver: Page = {
  id: 6,
  name: 'screensaver',
  cards: [],
  buttons: [],
  components: [
    { name: 'time', x: 40, y: 92, w: 400, h: 96, font: 'F_CLOCK', color: 'muted', align: 'center', valign: 'center', crop: 'bg', sample: '13:42' },
    { name: 'date', x: 40, y: 190, w: 400, h: 28, font: 'F_BODY', color: 'muted', align: 'center', valign: 'center', crop: 'bg', sample: 'maandag 12 oktober' },
  ],
  hotspots: [{ name: 'wake', x: 0, y: 0, w: W, h: H, touch: 'WAKE' }],
};

// ---- boot (Blackymas boot page kept; only its background changes) ----
const boot: Page = { id: 0, name: 'boot', cards: [], buttons: [], components: [], hotspots: [] };

export const PAGES: Page[] = [boot, home, moods, climate, calendar, notification, screensaver];

// Picture import order in the Editor (appended after any existing pictures; ids recorded in tft/ids.json).
export const PICTURES = ['boot', 'home', 'moods', 'moods-on', 'climate', 'calendar', 'notification', 'screensaver'] as const;
