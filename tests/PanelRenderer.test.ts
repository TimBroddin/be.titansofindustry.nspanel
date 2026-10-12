import { describe, expect, test } from 'bun:test';
import { MAX_BATCH, PanelRenderer } from '../lib/panel/PanelRenderer';

function setup() {
  const calls: Array<[string[], string[]]> = [];
  const timers: Array<() => void> = [];
  const r = new PanelRenderer(async (k, v) => { calls.push([k, v]); }, (fn) => { timers.push(fn); }, 50);
  const tick = async () => { const fns = timers.splice(0); fns.forEach((f) => f()); await Promise.resolve(); await Promise.resolve(); };
  return { r, calls, timers, tick };
}

describe('PanelRenderer', () => {
  test('coalesces updates within one window into one call', async () => {
    const { r, calls, timers, tick } = setup();
    r.update({ 'home.a.txt': '1' });
    r.update({ 'home.b.txt': '2' });
    expect(timers).toHaveLength(1);
    await tick();
    expect(calls).toEqual([[['home.a.txt', 'home.b.txt'], ['1', '2']]]);
  });

  test('does not resend unchanged values', async () => {
    const { r, calls, timers, tick } = setup();
    r.update({ 'home.a.txt': '1' });
    await tick();
    r.update({ 'home.a.txt': '1' });
    expect(timers).toHaveLength(0);
    r.update({ 'home.a.txt': '2', 'home.b.txt': 'x' });
    await tick();
    expect(calls[1]).toEqual([['home.a.txt', 'home.b.txt'], ['2', 'x']]);
  });

  test('reset() makes the next update resend everything', async () => {
    const { r, calls, tick } = setup();
    r.update({ 'home.a.txt': '1', 'home.b.txt': '2' });
    await tick();
    r.reset();
    r.update({});
    await tick();
    expect(calls[1]).toEqual([['home.a.txt', 'home.b.txt'], ['1', '2']]);
  });

  test('splits large updates into batches', async () => {
    const { r, calls } = setup();
    const props: Record<string, string> = {};
    for (let i = 0; i < MAX_BATCH + 5; i++) props[`home.c${i}.txt`] = String(i);
    r.update(props);
    await r.flush();
    expect(calls.map(([k]) => k.length)).toEqual([MAX_BATCH, 5]);
  });

  test('failed send is retried on the next flush', async () => {
    let fail = true;
    const sent: string[][] = [];
    const r = new PanelRenderer(async (k) => { if (fail) throw new Error('offline'); sent.push(k); }, () => {}, 50);
    r.update({ 'home.a.txt': '1' });
    await expect(r.flush()).rejects.toThrow('offline');
    fail = false;
    await r.flush();
    expect(sent).toEqual([['home.a.txt']]);
  });
});

describe('PanelRenderer.forget', () => {
  test('forgotten keys are resent even when the desired value did not change (panel changed it locally)', async () => {
    const calls: string[][] = [];
    const r = new PanelRenderer(async (k) => { calls.push(k); }, () => {}, 50);
    r.update({ 'moods.i01.picc': '3', 'moods.l01.picc': '3', 'moods.title.txt': 'Sferen' });
    await r.flush();
    r.forget(['moods.i01.picc', 'moods.l01.picc']);
    await r.flush();
    expect(calls[1]).toEqual(['moods.i01.picc', 'moods.l01.picc']);
  });
});
