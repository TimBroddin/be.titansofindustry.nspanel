// Usage: bun design/export.ts
// Renders every page to tft/assets/<page>.png (Nextion backgrounds / crop images) and
// design/preview/<page>.png (with sample text, for review). Needs Google Chrome.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PAGES } from './layout';
import { Mode, renderPage } from './render';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = resolve(import.meta.dir, '..');
const fontDir = `file://${join(root, 'design/fonts')}`;
const tmp = join(root, '.superpowers/design-export');
mkdirSync(tmp, { recursive: true });
mkdirSync(join(root, 'tft/assets'), { recursive: true });
mkdirSync(join(root, 'design/preview'), { recursive: true });

async function shoot(name: string, html: string, out: string): Promise<void> {
  const file = join(tmp, `${name}.html`);
  await Bun.write(file, html);
  const proc = Bun.spawn([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', '--window-size=480,320', '--virtual-time-budget=2000', `--screenshot=${out}`, `file://${file}`],
  { stdout: 'ignore', stderr: 'ignore' });
  if ((await proc.exited) !== 0) throw new Error(`Chrome failed for ${name}`);
}

const jobs: Array<[string, Mode, string]> = [];
for (const page of PAGES) {
  jobs.push([page.name, 'bg', `tft/assets/${page.name}.png`]);
  jobs.push([`${page.name}-preview`, 'preview', `design/preview/${page.name}.png`]);
  if (page.hasOnVariant) {
    jobs.push([`${page.name}-on`, 'on', `tft/assets/${page.name}-on.png`]);
  }
}
for (const [name, mode, out] of jobs) {
  const page = PAGES.find((p) => name.startsWith(p.name))!;
  await shoot(name, renderPage(page, mode, fontDir), join(root, out));
  console.log(`${out}`);
}
rmSync(tmp, { recursive: true, force: true });
