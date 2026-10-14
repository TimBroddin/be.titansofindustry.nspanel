// Uploads a TFT to the NSPanel: serves the file over HTTP (with the Range support ESPHome's uploader needs)
// and asks the panel to fetch it at 115200 baud.
//
//   bun scripts/upload-tft.ts --panel 192.168.1.152 [--file tft/nextion/nspanel_soft_dark.tft] [--host <this machine's IP>]
//
// Before you start: disable the NSPanel app in Homey (the upload blocks the panel for ~12 minutes), and if you just
// flashed the firmware, wait at least 60 s first. See firmware/README.md for what to do if an upload fails.
import { networkInterfaces } from 'os';
import { PanelConnection } from '../lib/panel/PanelConnection';

const arg = (name: string, fallback?: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v) throw new Error(`Missing --${name}`);
  return v;
};

const lanAddress = (): string => {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  }
  throw new Error('No LAN address found, pass --host');
};

const panel = arg('panel');
const path = arg('file', 'tft/nextion/nspanel_soft_dark.tft');
const host = arg('host', lanAddress());
const port = Number(arg('port', '8000'));
const secrets = await Bun.file(new URL('../firmware/secrets.yaml', import.meta.url)).text();
const key = /api_encryption_key:\s*"?([^"\s]+)"?/.exec(secrets)?.[1];
if (!key) throw new Error('api_encryption_key not found in firmware/secrets.yaml');

const file = Bun.file(path);
const size = file.size;
if (!size) throw new Error(`${path} is empty or missing`);
const name = path.split('/').pop()!;

let lastLog = 0;
const server = Bun.serve({
  hostname: '0.0.0.0',
  port,
  fetch(req) {
    const range = req.headers.get('range');
    const head = req.method === 'HEAD';
    if (!range) return new Response(head ? null : file, { headers: { 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (!m) return new Response(null, { status: 416 });
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (Date.now() - lastLog > 30000 || end === size - 1) {
      lastLog = Date.now();
      console.log(`panel requested from ${Math.round((start / size) * 100)}%`);
    }
    return new Response(head ? null : file.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
    });
  },
});

const url = `http://${host}:${port}/${name}`;
console.log(`Serving ${path} (${size} bytes) at ${url}`);

const conn = new PanelConnection({
  host: panel, port: 6053, encryptionKey: key, log: () => {}, error: (...a) => console.error('[panel]', ...a),
});
conn.on('ready', async () => {
  await conn.call('upload_tft', { url, baud: 0 });
  console.log('Upload started. It takes about 12 minutes; the panel reboots when it is done.');
  console.log('Follow progress with: esphome logs firmware/nspanel.yaml --device', panel);
  conn.stop();
});
conn.on('disconnected', () => {});
conn.start();

// The panel streams the file and reboots when done; stop serving once it has been quiet for a while.
let quietSince = Date.now();
setInterval(() => {
  if (server.pendingRequests > 0) quietSince = Date.now();
  if (Date.now() - quietSince > 120000) {
    console.log('No requests for 2 minutes, stopping. Check the panel (or the esphome logs) for the result.');
    server.stop();
    process.exit(0);
  }
}, 5000);
