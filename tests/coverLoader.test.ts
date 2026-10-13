import { describe, expect, test } from 'bun:test';
import { PNG } from 'pngjs';
import { CoverLoader } from '../lib/media/coverLoader';
import { CoverSender } from '../lib/media/coverSender';

const png = (): Uint8Array => {
  const img = new PNG({ width: 8, height: 8 });
  img.data.fill(255);
  return PNG.sync.write(img);
};

const setup = (arts: Record<string, { url: string; key: string } | null>, fetchImpl: (url: string) => Promise<Uint8Array> = async () => png()) => {
  const calls: string[] = [];
  const shown: boolean[] = [];
  const fetched: string[] = [];
  const sender = new CoverSender(async (action, args) => { calls.push(`${action}:${(args as { id?: string }).id ?? ''}`); }, async () => {});
  const loader = new CoverLoader({
    art: async (id) => arts[id] ?? null,
    fetch: async (url) => { fetched.push(url); return fetchImpl(url); },
    sender,
    shown: (on) => shown.push(on),
    error: () => {},
  });
  return { loader, calls, shown, fetched };
};

describe('CoverLoader', () => {
  test('sends a cover once per image version, clears when there is no art', async () => {
    const arts = { k: { url: '/api/image/a', key: '/api/image/a@1' }, w: null };
    const { loader, calls, shown, fetched } = setup(arts);
    await loader.refresh('k');
    await loader.refresh('k');
    expect(fetched).toEqual(['/api/image/a']);
    expect(calls).toEqual(['cover_begin:c1', 'cover_strips:c1']);
    arts.k = { url: '/api/image/a', key: '/api/image/a@2' };
    await loader.refresh('k');
    expect(calls.at(-1)).toBe('cover_strips:c2');
    await loader.refresh('w');
    expect(calls.at(-1)).toBe('cover_clear:');
    expect(shown).toEqual([true, true, false]);
  });

  test('a failed fetch clears; reset sends again', async () => {
    const { loader, calls, shown } = setup({ k: { url: '/x', key: '/x@1' } }, async () => { throw new Error('401'); });
    await loader.refresh('k');
    expect(calls).toEqual(['cover_clear:']);
    expect(shown).toEqual([false]);
    loader.reset();
    await loader.refresh('k');
    expect(calls).toEqual(['cover_clear:', 'cover_clear:']);
  });

  test('no player clears once', async () => {
    const { loader, calls } = setup({});
    await loader.refresh(null);
    await loader.refresh(null);
    expect(calls).toEqual(['cover_clear:']);
  });
});
