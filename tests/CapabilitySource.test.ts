import { describe, expect, test } from 'bun:test';
import { CapabilitySource, DeviceProvider } from '../lib/sources/CapabilitySource';

function fakeHomey(initial: Record<string, Record<string, unknown>>) {
  const listeners = new Map<string, (v: unknown) => void>();
  let destroyed: string[] = [];
  const missing = new Set<string>();
  const provider: DeviceProvider = {
    async getDevice(id) {
      if (missing.has(id) || !initial[id]) throw new Error(`device ${id} not found`);
      return {
        capabilitiesObj: Object.fromEntries(Object.entries(initial[id]).map(([c, value]) => [c, { value }])),
        makeCapabilityInstance(cap, listener) {
          listeners.set(`${id}:${cap}`, listener);
          return { destroy: () => { destroyed.push(`${id}:${cap}`); } };
        },
      };
    },
  };
  return { provider, listeners, missing, destroyed: () => destroyed, reset: () => { destroyed = []; } };
}

describe('CapabilitySource', () => {
  test('loads initial values and reports live changes', async () => {
    const h = fakeHomey({ d: { onoff: true } });
    let changes = 0;
    const s = new CapabilitySource(h.provider, () => { changes++; });
    await s.watch([{ deviceId: 'd', capability: 'onoff' }]);
    expect(s.values.get('d:onoff')).toBe(true);
    expect(changes).toBe(1);
    h.listeners.get('d:onoff')!(false);
    expect(s.values.get('d:onoff')).toBe(false);
    expect(changes).toBe(2);
  });

  test('unwatches removed refs and keeps existing ones', async () => {
    const h = fakeHomey({ d: { onoff: true, dim: 0.5 } });
    const s = new CapabilitySource(h.provider, () => {});
    await s.watch([{ deviceId: 'd', capability: 'onoff' }, { deviceId: 'd', capability: 'dim' }]);
    await s.watch([{ deviceId: 'd', capability: 'dim' }]);
    expect(h.destroyed()).toEqual(['d:onoff']);
    expect(s.values.has('d:onoff')).toBe(false);
    expect(s.values.get('d:dim')).toBe(0.5);
  });

  test('missing device yields null without breaking others, and is retried later', async () => {
    const h = fakeHomey({ ok: { onoff: true }, flaky: { onoff: true } });
    h.missing.add('flaky');
    const errors: unknown[] = [];
    const s = new CapabilitySource(h.provider, () => {}, (...a) => errors.push(a));
    const refs = [{ deviceId: 'flaky', capability: 'onoff' }, { deviceId: 'ok', capability: 'onoff' }];
    await s.watch(refs);
    expect(s.values.get('flaky:onoff')).toBeNull();
    expect(s.values.get('ok:onoff')).toBe(true);
    expect(errors).toHaveLength(1);
    h.missing.delete('flaky');
    await s.watch(refs);
    expect(s.values.get('flaky:onoff')).toBe(true);
  });

  test('destroy releases all instances', async () => {
    const h = fakeHomey({ d: { onoff: true } });
    const s = new CapabilitySource(h.provider, () => {});
    await s.watch([{ deviceId: 'd', capability: 'onoff' }]);
    s.destroy();
    expect(h.destroyed()).toEqual(['d:onoff']);
    expect(s.values.size).toBe(0);
  });
});
