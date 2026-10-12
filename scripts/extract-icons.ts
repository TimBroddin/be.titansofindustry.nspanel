// Usage: bun scripts/extract-icons.ts <path-to-NSPanel_HA_Blueprint-checkout>
// Writes lib/icons.json: { "<mdi-name>": "<glyph>" } from the blueprint's all_icons map.
const root = process.argv[2];
if (!root) throw new Error('Pass the path to a NSPanel_HA_Blueprint checkout');
const src = await Bun.file(`${root}/nspanel_blueprint.yaml`).text();
const start = src.indexOf('all_icons: {');
if (start < 0) throw new Error('all_icons not found');
const body = src.slice(start + 'all_icons: {'.length, src.indexOf('}', start));
const icons: Record<string, string> = {};
for (const m of body.matchAll(/([a-z0-9-]+): "\\u([0-9A-F]{4})"/g)) {
  if (m[1] === 'blank' || m[1] === 'void') continue;
  icons[m[1]] = String.fromCharCode(parseInt(m[2], 16));
}
await Bun.write('lib/icons.json', `${JSON.stringify(icons)}\n`);
console.log(`Wrote ${Object.keys(icons).length} icons`);
