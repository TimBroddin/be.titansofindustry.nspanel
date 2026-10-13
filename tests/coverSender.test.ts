import { describe, expect, test } from 'bun:test';
import { CoverSender } from '../lib/media/coverSender';

describe('CoverSender', () => {
  test('sends begin, then batches of 40 with a pause after each', async () => {
    const log: string[] = [];
    const s = new CoverSender(async (a, args) => { log.push(`${a}:${(args.strips as string[] | undefined)?.length ?? args.id ?? ''}`); }, async (ms) => { log.push(`sleep ${ms}`); });
    const ok = await s.send('cover-1', Array.from({ length: 85 }, (_, i) => `${i},0,1,1,0`));
    expect(ok).toBe(true);
    expect(log).toEqual(['cover_begin:cover-1', 'cover_strips:40', 'sleep 120', 'cover_strips:40', 'sleep 120', 'cover_strips:5', 'sleep 120']);
  });

  test('a newer cover cancels the one still being sent', async () => {
    const log: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    const s = new CoverSender(async (a, args) => { log.push(`${a}:${args.id ?? ''}`); }, async () => {
      if (first) { first = false; await gate; }
    });
    const old = s.send('old', Array.from({ length: 120 }, () => '0,0,1,1,0'));
    await Promise.resolve();
    const fresh = s.send('new', ['0,0,1,1,0']);
    release();
    expect(await old).toBe(false);
    expect(await fresh).toBe(true);
    expect(log.filter((l) => l.endsWith(':old'))).toEqual(['cover_begin:old', 'cover_strips:old']);
  });

  test('clear cancels a running transfer and clears the panel', async () => {
    const log: string[] = [];
    const s = new CoverSender(async (a) => { log.push(a); }, async () => {});
    await s.clear();
    expect(log).toEqual(['cover_clear']);
  });
});
