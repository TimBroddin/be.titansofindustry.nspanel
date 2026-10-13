// One-off: snapshot of the layout the first Soft dark TFT was built from (commit a54f8f7), used by
// design/round2.ts as the "currently on the panel" baseline. Usage: bun design/snapshot-r1.ts /tmp/layout-r1.ts
const src = process.argv[2];
if (!src) throw new Error('Pass the r1 layout.ts');
const { PAGES } = await import(src);
const snapshot = Object.fromEntries((PAGES as Array<{ name: string; components: any[]; hotspots: any[] }>).map((p) => [p.name, {
  components: p.components.map(({ name, x, y, w, h, font }) => ({ name, x, y, w, h, font })),
  hotspots: p.hotspots.map(({ name, x, y, w, h }) => ({ name, x, y, w, h })),
}]));
await Bun.write('design/built-r1.json', `${JSON.stringify(snapshot, null, 1)}\n`);
console.log('wrote design/built-r1.json', Object.keys(snapshot).join(', '));
