import { describe, expect, test } from 'bun:test';
import { ActionRunner, HomeyActions, parseTarget } from '../lib/actions/ActionRunner';
import { normalizeConfig } from '../lib/config';

const touch = (page: string, action: string, component: string) => ({ type: 'touch' as const, page, action, component });

function setup(opts: { refuse?: boolean; onoff?: boolean } = {}) {
  const calls: string[] = [];
  const homey: HomeyActions = {
    async setMood(id) { if (opts.refuse) throw new Error('Missing Scopes'); calls.push(`mood:${id}`); },
    async triggerFlow(id, advanced) { calls.push(`flow:${id}:${advanced}`); },
    async setCapability(d, c, v) { calls.push(`set:${d}:${c}:${v}`); },
    getCapability: () => opts.onoff ?? false,
    async fireTileTrigger(n, label) { calls.push(`trigger:${n}:${label}`); },
  };
  const config = normalizeConfig({
    home: { thermostat: { deviceId: 'th' } },
    moods: [
      { type: 'mood', moodId: 'm1', icon: '', label: 'Film' },
      { type: 'flow', flowId: 'f1', advanced: true, icon: '', label: 'Eten' },
      { type: 'toggle', deviceId: 'lamp', icon: '', label: 'Licht' },
      { type: 'trigger', icon: '', label: 'Bel' },
    ],
  });
  const runner = new ActionRunner(() => config, homey, () => ({ deviceId: 'th', min: 7, max: 30, step: 0.5 }), () => {});
  return { runner, calls };
}

describe('ActionRunner', () => {
  test('mood tile sets the mood, fires the trigger, and is momentary', async () => {
    const { runner, calls } = setup();
    expect(await runner.handle(touch('moods', 'tile', '1'))).toEqual({ momentaryTile: 0 });
    expect(calls).toEqual(['trigger:1:Film', 'mood:m1']);
  });

  test('flow tile starts the (advanced) flow', async () => {
    const { runner, calls } = setup();
    expect(await runner.handle(touch('moods', 'tile', '2'))).toEqual({ momentaryTile: 1 });
    expect(calls).toContain('flow:f1:true');
  });

  test('toggle tile inverts onoff', async () => {
    const { runner, calls } = setup({ onoff: true });
    expect(await runner.handle(touch('moods', 'tile', '3'))).toEqual({});
    expect(calls).toContain('set:lamp:onoff:false');
  });

  test('trigger-only tile just fires the trigger', async () => {
    const { runner, calls } = setup();
    expect(await runner.handle(touch('moods', 'tile', '4'))).toEqual({ momentaryTile: 3 });
    expect(calls).toEqual(['trigger:4:Bel']);
  });

  test('refused action reverts the tile and reports the error', async () => {
    const { runner } = setup({ refuse: true });
    expect(await runner.handle(touch('moods', 'tile', '1'))).toEqual({ revertTile: 0, error: 'Missing Scopes' });
  });

  test('empty or out-of-range tile is ignored', async () => {
    const { runner, calls } = setup();
    expect(await runner.handle(touch('moods', 'tile', '7'))).toEqual({ revertTile: 6 });
    expect(await runner.handle(touch('moods', 'tile', 'x'))).toEqual({});
    expect(calls).toEqual([]);
  });

  test('climate target sets target_temperature', async () => {
    const { runner, calls } = setup();
    expect(await runner.handle(touch('climate', 'target', '205'))).toEqual({});
    expect(calls).toEqual(['set:th:target_temperature:20.5']);
  });

  test('other events are ignored', async () => {
    const { runner, calls } = setup();
    expect(await runner.handle({ type: 'page', page: 'home' })).toEqual({});
    expect(await runner.handle(touch('notification', 'close', ''))).toEqual({});
    expect(calls).toEqual([]);
  });
});

describe('ActionRunner climate reverts', () => {
  test('refused target asks to revert the climate page', async () => {
    const calls: string[] = [];
    const homey: HomeyActions = {
      async setMood() {}, async triggerFlow() {}, getCapability: () => null, async fireTileTrigger() {},
      async setCapability() { calls.push('set'); throw new Error('Device unavailable'); },
    };
    const runner = new ActionRunner(() => normalizeConfig({}), homey, () => ({ deviceId: 'th', min: 7, max: 30, step: 0.5 }), () => {});
    expect(await runner.handle(touch('climate', 'target', '205'))).toEqual({ revertClimate: true, error: 'Device unavailable' });
  });

  test('no thermostat or garbage value reverts without calling Homey', async () => {
    const homey: HomeyActions = {
      async setMood() {}, async triggerFlow() {}, getCapability: () => null, async fireTileTrigger() {},
      async setCapability() { throw new Error('should not be called'); },
    };
    const noThermostat = new ActionRunner(() => normalizeConfig({}), homey, () => null, () => {});
    expect(await noThermostat.handle(touch('climate', 'target', '205'))).toEqual({ revertClimate: true });
    const withThermostat = new ActionRunner(() => normalizeConfig({}), homey, () => ({ deviceId: 'th', min: 7, max: 30, step: 0.5 }), () => {});
    expect(await withThermostat.handle(touch('climate', 'target', 'abc'))).toEqual({ revertClimate: true });
  });
});

describe('parseTarget', () => {
  const th = { deviceId: 'th', min: 7, max: 30, step: 0.5 };
  test.each([['205', 20.5], ['207', 20.5], ['999', 30], ['12', 7], ['abc', null], ['', null]])('%s → %p', (arg, want) => {
    expect(parseTarget(arg as string, th)).toBe(want as number | null);
  });
});
