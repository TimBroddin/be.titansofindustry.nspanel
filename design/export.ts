// Usage: bun design/export.ts
// Renders every page to tft/assets/<page>.png (Nextion backgrounds / crop images) and
// design/preview/<page>.png and design/preview-en/<page>.png (with Dutch / English sample text, for review). Needs Google Chrome.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PAGES } from './layout';
import { SAMPLES_EN } from './previewSamples';
import { renderPage } from './render';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = resolve(import.meta.dir, '..');
const fontDir = `file://${join(root, 'design/fonts')}`;
const tmp = join(root, '.superpowers/design-export');
mkdirSync(tmp, { recursive: true });
mkdirSync(join(root, 'tft/assets'), { recursive: true });
mkdirSync(join(root, 'design/preview'), { recursive: true });
mkdirSync(join(root, 'design/preview-en'), { recursive: true });

async function shoot(name: string, html: string, out: string): Promise<void> {
  const file = join(tmp, `${name}.html`);
  await Bun.write(file, html);
  const proc = Bun.spawn([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', '--window-size=480,320', '--virtual-time-budget=2000', `--screenshot=${out}`, `file://${file}`],
  { stdout: 'ignore', stderr: 'ignore' });
  if ((await proc.exited) !== 0) throw new Error(`Chrome failed for ${name}`);
}

const jobs: Array<{ name: string; html: string; out: string }> = [];
for (const page of PAGES) {
  jobs.push({ name: page.name, html: renderPage(page, 'bg', fontDir), out: `tft/assets/${page.name}.png` });
  jobs.push({ name: `${page.name}-preview`, html: renderPage(page, 'preview', fontDir), out: `design/preview/${page.name}.png` });
  jobs.push({ name: `${page.name}-preview-en`, html: renderPage(page, 'preview', fontDir, undefined, SAMPLES_EN), out: `design/preview-en/${page.name}.png` });
  for (const v of page.variants ?? []) {
    jobs.push({ name: `${page.name}-${v.suffix}`, html: renderPage(page, 'bg', fontDir, v), out: `tft/assets/${page.name}-${v.suffix}.png` });
  }
}
for (const job of jobs) {
  await shoot(job.name, job.html, join(root, job.out));
  console.log(job.out);
}
rmSync(tmp, { recursive: true, force: true });
