import { describe, expect, test } from 'bun:test';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import {
  MAX_COVER_RECTS, RGBImage, correctBlue, coverFit, coverStrips, decodeImage, quantize, renderStrips, rgb565, toStrips,
} from '../lib/media/cover';

const solid = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): RGBImage => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
};
const px = (img: RGBImage, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));

describe('cover pipeline', () => {
  test('decodes PNG and JPEG', () => {
    const png = new PNG({ width: 4, height: 2 });
    png.data.fill(200);
    const decodedPng = decodeImage(PNG.sync.write(png));
    expect([decodedPng.width, decodedPng.height]).toEqual([4, 2]);
    const raw = solid(8, 8, () => [10, 20, 30]);
    const jpg = jpeg.encode({ width: 8, height: 8, data: Buffer.from(raw.data) }, 90).data;
    const decodedJpg = decodeImage(jpg);
    expect([decodedJpg.width, decodedJpg.height]).toEqual([8, 8]);
    expect(() => decodeImage(new Uint8Array([1, 2, 3]))).toThrow('Unsupported image');
  });

  test('cover-fit crops the centre square and scales to 96x96', () => {
    // 200x100: left 100 px red, right 100 px blue; centre square = x 50..150 -> half red, half blue
    const img = coverFit(solid(200, 100, (x) => (x < 100 ? [255, 0, 0] : [0, 0, 255])), 96);
    expect([img.width, img.height]).toEqual([96, 96]);
    expect(px(img, 10, 10)).toEqual([255, 0, 0]);
    expect(px(img, 85, 10)).toEqual([0, 0, 255]);
  });

  test('blue correction for the LCD', () => {
    expect(px(correctBlue(solid(1, 1, () => [100, 100, 200]), 0.85), 0, 0)).toEqual([100, 100, 170]);
  });

  test('quantize keeps few colours exact and caps many colours', () => {
    const three = quantize(solid(9, 1, (x) => [[255, 0, 0], [0, 255, 0], [0, 0, 255]][x % 3] as [number, number, number]), 32);
    expect(three.palette).toHaveLength(3);
    expect(new Set(three.palette)).toEqual(new Set([0xff0000, 0x00ff00, 0x0000ff]));
    const many = quantize(solid(64, 1, (x) => [x * 4, 255 - x * 4, (x * 37) % 256]), 32);
    expect(many.palette.length).toBeLessThanOrEqual(32);
    expect(Math.max(...many.indices)).toBeLessThan(many.palette.length);
  });

  test('strips: uniform image is one rectangle; round-trip reproduces the quantized image', () => {
    const uni = quantize(solid(96, 96, () => [20, 40, 60]), 32);
    expect(toStrips(uni, 96, 20, 62)).toEqual([`20,62,96,96,${rgb565(20, 40, 60)}`]);

    const img = quantize(solid(96, 96, (x, y) => ((Math.floor(x / 7) + Math.floor(y / 5)) % 2 ? [250, 200, 10] : [10, 30, 90])), 32);
    const strips = toStrips(img, 96, 20, 62);
    const drawn = renderStrips(strips, 96, 20, 62);
    for (let i = 0; i < 96 * 96; i++) {
      const c = img.palette[img.indices[i]];
      expect(drawn[i]).toBe(rgb565((c >> 16) & 255, (c >> 8) & 255, c & 255));
    }
    expect(strips.length).toBeLessThan(96 * 20); // vertical merging keeps it far below one strip per run
  });

  test('busy images drop colours until they fit the panel cache', () => {
    const png = new PNG({ width: 96, height: 96 });
    for (let i = 0; i < 96 * 96; i++) {
      const v = (i * 2654435761) >>> 0; // noise: worst case for run merging
      png.data.set([v & 255, (v >> 8) & 255, (v >> 16) & 255, 255], i * 4);
    }
    const buf = PNG.sync.write(png);
    expect(coverStrips(buf, { x: 20, y: 62 }, { maxRects: Infinity }).length).toBeGreaterThan(MAX_COVER_RECTS);
    const fitted = coverStrips(buf, { x: 20, y: 62 });
    expect(fitted.length).toBeLessThanOrEqual(MAX_COVER_RECTS);
    expect(fitted.length).toBeGreaterThan(0);
  });

  test('coverStrips end to end from a PNG buffer', () => {
    const png = new PNG({ width: 120, height: 120 });
    for (let i = 0; i < png.data.length; i += 4) png.data.set([255, 255, 255, 255], i);
    const strips = coverStrips(PNG.sync.write(png), { x: 20, y: 62 });
    expect(strips).toEqual([`20,62,96,96,${rgb565(255, 255, 217)}`]); // white with blue x0.85
  });
});
