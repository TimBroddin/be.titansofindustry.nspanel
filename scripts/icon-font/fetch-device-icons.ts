// Downloads the icon of every device on the selected Homey into <out-dir>/<app>/<driver>.svg,
// so they can be compiled into the panel's Homey icon font next to the public homey-vectors set.
// Usage: bun scripts/icon-font/fetch-device-icons.ts /tmp/device-icons
// Requires the Homey CLI to be logged in with the right Homey selected (`bunx homey select current`).
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('Pass an output directory');

// Homey rate-limits the API ("Too many requests"), and the CLI sometimes fails without output: retry with
// growing pauses.
const homey = (...args: string[]): string => {
  let last = '';
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = Bun.spawnSync(['bunx', 'homey', 'api', ...args], { stdout: 'pipe', stderr: 'pipe' });
    if (r.exitCode === 0) return r.stdout.toString();
    last = r.stderr.toString() || `exit ${r.exitCode}`;
    Bun.sleepSync(5000 * attempt);
  }
  throw new Error(`homey ${args.join(' ')} failed: ${last}`);
};

const devices = JSON.parse(homey('devices', 'get-devices', '--json', '--jq',
  '[to_entries[] | {icon: .value.iconObj.url, driver: .value.driverId}] | map(select(.icon != null))')) as Array<{ icon: string; driver: string }>;

const byIcon = new Map<string, string>();
for (const d of devices) {
  if (byIcon.has(d.icon)) continue;
  // "homey:app:nl.philips.hue:bulb" -> "nl.philips.hue/bulb"; built-in drivers ("homey:manager:...") keep their last parts
  const parts = d.driver.split(':');
  const name = parts.length >= 4 ? `${parts[2]}/${parts.slice(3).join('-')}` : parts.slice(1).join('/');
  let key = name;
  for (let i = 2; [...byIcon.values()].includes(key); i++) key = `${name}-${i}`;
  byIcon.set(d.icon, key);
}

let ok = 0;
for (const [url, key] of byIcon) {
  const file = join(out, `${key}.svg`);
  if (existsSync(file)) { ok++; continue; } // already fetched by an earlier (interrupted) run
  Bun.sleepSync(1500); // stay under Homey's rate limit
  const svg = homey('raw', '--path', url);
  if (!svg.trimStart().startsWith('<svg') && !svg.includes('<svg')) {
    console.log(`skip ${key}: not an SVG`);
    continue;
  }
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await Bun.write(file, svg);
  ok++;
}
console.log(`${ok} device icons written to ${out} (${devices.length} devices)`);
