// Usage: bun design/screenshots.ts (after bun design/export.ts)
// Puts the page previews (design/preview/*.png) on one overview image: docs/screenshots.png. Needs Google Chrome.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = resolve(import.meta.dir, '..');
const PAGES: Array<[string, string]> = [
  ['home', 'Home'], ['moods', 'Moods'], ['climate', 'Thermostat'], ['calendar', 'Calendar'],
  ['media', 'Media'], ['timer', 'Kitchen timer'], ['notification', 'Notification'], ['screensaver', 'Screensaver'],
];
const COLS = 4;
const W = 480;
const H = 320;
const GAP = 24;
const LABEL = 28;
const width = COLS * W + (COLS + 1) * GAP;
const height = Math.ceil(PAGES.length / COLS) * (H + LABEL + GAP) + GAP;

const tiles = PAGES.map(([file, title]) => `<figure><img src="file://${join(root, 'design/preview', `${file}.png`)}"><figcaption>${title}</figcaption></figure>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #e9e9ec; }
  .grid { display: grid; grid-template-columns: repeat(${COLS}, ${W}px); gap: ${GAP}px; padding: ${GAP}px; }
  figure { margin: 0; }
  img { display: block; width: ${W}px; height: ${H}px; border-radius: 14px; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
  figcaption { height: ${LABEL}px; line-height: ${LABEL}px; font: 500 15px -apple-system, sans-serif; color: #333; text-align: center; }
</style></head><body><div class="grid">${tiles}</div></body></html>`;

const tmp = join(root, '.superpowers/screenshots');
mkdirSync(tmp, { recursive: true });
mkdirSync(join(root, 'docs'), { recursive: true });
const file = join(tmp, 'sheet.html');
await Bun.write(file, html);
const out = join(root, 'docs/screenshots.png');
const proc = Bun.spawn([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', `--window-size=${width},${height}`, '--virtual-time-budget=2000', `--screenshot=${out}`, `file://${file}`],
{ stdout: 'ignore', stderr: 'ignore' });
if ((await proc.exited) !== 0) throw new Error('Chrome failed');
rmSync(tmp, { recursive: true, force: true });
console.log('wrote docs/screenshots.png');
