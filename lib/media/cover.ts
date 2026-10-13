// Album art -> rectangles the firmware draws with Nextion `fill` commands.
// decode (JPEG/PNG, pure JS) -> centre crop + area-average scale to 96x96 -> blue correction for this
// LCD's blue cast -> median-cut palette -> horizontal runs merged vertically into rectangles.
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export interface RGBImage { width: number; height: number; data: Uint8Array } // RGBA
export interface Quantized { width: number; height: number; palette: number[]; indices: Uint8Array } // palette: 0xRRGGBB

export const COVER_SIZE = 96;

export const rgb565 = (r: number, g: number, b: number): number => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);

export function decodeImage(buf: Uint8Array): RGBImage {
  const bytes = Buffer.from(buf);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
    return { width: img.width, height: img.height, data: img.data };
  }
  throw new Error('Unsupported image (expected JPEG or PNG)');
}

// Centre square crop, then each target pixel averages the source pixels it covers.
export function coverFit(img: RGBImage, size = COVER_SIZE): RGBImage {
  const side = Math.min(img.width, img.height);
  const ox = Math.floor((img.width - side) / 2);
  const oy = Math.floor((img.height - side) / 2);
  const scale = side / size;
  const out = new Uint8Array(size * size * 4);
  for (let ty = 0; ty < size; ty++) {
    const y0 = oy + Math.floor(ty * scale);
    const y1 = Math.max(y0 + 1, oy + Math.floor((ty + 1) * scale));
    for (let tx = 0; tx < size; tx++) {
      const x0 = ox + Math.floor(tx * scale);
      const x1 = Math.max(x0 + 1, ox + Math.floor((tx + 1) * scale));
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      out.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), 255], (ty * size + tx) * 4);
    }
  }
  return { width: size, height: size, data: out };
}

export function correctBlue(img: RGBImage, factor = 0.85): RGBImage {
  const data = new Uint8Array(img.data);
  for (let i = 2; i < data.length; i += 4) data[i] = Math.round(data[i] * factor);
  return { ...img, data };
}

interface Box { colors: number[]; counts: number[] }

const channel = (c: number, ch: number): number => (c >> (16 - ch * 8)) & 255;

function boxRange(box: Box): { ch: number; range: number } {
  let best = { ch: 0, range: -1 };
  for (let ch = 0; ch < 3; ch++) {
    let lo = 255; let hi = 0;
    for (const c of box.colors) {
      const v = channel(c, ch); if (v < lo) lo = v; if (v > hi) hi = v;
    }
    if (hi - lo > best.range) best = { ch, range: hi - lo };
  }
  return best;
}

// Median cut over unique colours (weighted by pixel count). Exact when there are few colours.
export function quantize(img: RGBImage, maxColors = 32): Quantized {
  const n = img.width * img.height;
  const counts = new Map<number, number>();
  const pixels = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const c = (img.data[i * 4] << 16) | (img.data[i * 4 + 1] << 8) | img.data[i * 4 + 2];
    pixels[i] = c;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let boxes: Box[] = [{ colors: [...counts.keys()], counts: [...counts.values()] }];
  while (boxes.length < maxColors) {
    const scored = boxes.map((b) => ({ b, ...boxRange(b), weight: b.counts.reduce((s, v) => s + v, 0) }))
      .filter((s) => s.b.colors.length > 1)
      .sort((a, z) => z.range * z.weight - a.range * a.weight);
    if (!scored.length) break;
    const { b, ch, weight } = scored[0];
    const order = b.colors.map((c, i) => [c, b.counts[i]] as [number, number]).sort((p, q) => channel(p[0], ch) - channel(q[0], ch));
    let acc = 0; let cut = 1;
    for (let i = 0; i < order.length - 1; i++) {
      acc += order[i][1]; if (acc >= weight / 2) {
        cut = i + 1; break;
      } cut = i + 1;
    }
    const left = order.slice(0, cut); const right = order.slice(cut);
    boxes = boxes.filter((x) => x !== b).concat(
      { colors: left.map((p) => p[0]), counts: left.map((p) => p[1]) },
      { colors: right.map((p) => p[0]), counts: right.map((p) => p[1]) },
    );
  }
  const palette: number[] = [];
  const indexOf = new Map<number, number>();
  boxes.forEach((b, bi) => {
    let r = 0; let g = 0; let bl = 0; let w = 0;
    b.colors.forEach((c, i) => {
      r += channel(c, 0) * b.counts[i]; g += channel(c, 1) * b.counts[i]; bl += channel(c, 2) * b.counts[i]; w += b.counts[i];
    });
    palette.push((Math.round(r / w) << 16) | (Math.round(g / w) << 8) | Math.round(bl / w));
    for (const c of b.colors) indexOf.set(c, bi);
  });
  const indices = new Uint8Array(n);
  for (let i = 0; i < n; i++) indices[i] = indexOf.get(pixels[i]) as number;
  return {
    width: img.width, height: img.height, palette, indices,
  };
}

// Horizontal runs, merged with identical runs directly below into rectangles: "x,y,w,h,rgb565".
export function toStrips(q: Quantized, size: number, ox: number, oy: number): string[] {
  type Rect = { x: number; y: number; w: number; h: number; idx: number };
  const rects: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let y = 0; y < size; y++) {
    const next = new Map<string, Rect>();
    let start = 0;
    for (let x = 1; x <= size; x++) {
      const idx = q.indices[y * size + start];
      if (x < size && q.indices[y * size + x] === idx) continue;
      const key = `${start},${x - start},${idx}`;
      const prev = open.get(key);
      if (prev && prev.y + prev.h === y) {
        prev.h++;
        next.set(key, prev);
      } else {
        const r = {
          x: start, y, w: x - start, h: 1, idx,
        };
        rects.push(r);
        next.set(key, r);
      }
      start = x;
    }
    open = next;
  }
  return rects.map((r) => {
    const c = q.palette[r.idx];
    return `${ox + r.x},${oy + r.y},${r.w},${r.h},${rgb565((c >> 16) & 255, (c >> 8) & 255, c & 255)}`;
  });
}

// Inverse of toStrips, for tests: the rgb565 image the panel would show.
export function renderStrips(strips: string[], size: number, ox: number, oy: number): Uint16Array {
  const out = new Uint16Array(size * size);
  for (const s of strips) {
    const [x, y, w, h, c] = s.split(',').map(Number);
    for (let yy = y - oy; yy < y - oy + h; yy++) for (let xx = x - ox; xx < x - ox + w; xx++) out[yy * size + xx] = c;
  }
  return out;
}

export function coverStrips(buf: Uint8Array, origin: { x: number; y: number }, opts: { size?: number; colors?: number; blue?: number } = {}): string[] {
  const size = opts.size ?? COVER_SIZE;
  const img = correctBlue(coverFit(decodeImage(buf), size), opts.blue ?? 0.85);
  return toStrips(quantize(img, opts.colors ?? 32), size, origin.x, origin.y);
}
