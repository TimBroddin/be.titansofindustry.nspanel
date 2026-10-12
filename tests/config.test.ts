import { describe, expect, test } from 'bun:test';
import {
  CHIP_SLOTS, VALUE_SLOTS, capKey, defaultConfig, loadConfig, migrateLegacy, normalizeConfig, watchedCapabilities,
} from '../lib/config';

describe('config', () => {
  test('defaults have empty slots and relay buttons', () => {
    const c = defaultConfig();
    expect(c.version).toBe(1);
    expect(c.home.thermostat).toBeNull();
    expect(c.home.chips).toHaveLength(CHIP_SLOTS);
    expect(c.home.values).toHaveLength(VALUE_SLOTS);
    expect(c.home.chips.every((x) => x === null)).toBe(true);
    expect(c.buttons).toEqual({ left: 'relay', right: 'relay' });
  });

  test('normalize pads, truncates and drops incomplete slots', () => {
    const c = normalizeConfig({
      home: {
        chips: [{ deviceId: 'd1', capability: 'onoff', icon: 'X' }, { deviceId: 'd2' }, ...Array(10).fill(null)],
        values: [{ deviceId: 'd3', capability: 'measure_power', icon: 'Y', unit: 'W' }],
        thermostat: { deviceId: 't1' },
      },
      buttons: { left: 'event', right: 'bogus' },
    });
    expect(c.home.chips).toHaveLength(CHIP_SLOTS);
    expect(c.home.chips[0]).toEqual({ deviceId: 'd1', capability: 'onoff', icon: 'X' });
    expect(c.home.chips[1]).toBeNull();
    expect(c.home.values[0]).toEqual({ deviceId: 'd3', capability: 'measure_power', icon: 'Y', unit: 'W' });
    expect(c.home.values[1]).toBeNull();
    expect(c.home.thermostat).toEqual({ deviceId: 't1' });
    expect(c.buttons).toEqual({ left: 'event', right: 'relay' });
  });

  test('migrates legacy nspanelConfig', () => {
    const c = migrateLegacy({
      chips: [{ device: 'd1', capability: 'alarm_contact', icon: 'A', unit: '' }],
      entities: [{ device: 'd2', capability: 'measure_temperature', icon: 'B', label: 'Living' }],
    });
    expect(c.home.chips[0]).toEqual({ deviceId: 'd1', capability: 'alarm_contact', icon: 'A' });
    expect(c.home.values[0]).toEqual({ deviceId: 'd2', capability: 'measure_temperature', icon: 'B', unit: '' });
  });

  test('decodes escaped icon text from the old settings page', () => {
    const c = migrateLegacy({ chips: [{ device: 'd1', capability: 'onoff', icon: '\\uE335' }] });
    expect(c.home.chips[0]?.icon).toBe('\uE335');
  });

  test('loadConfig prefers dashboardConfig over legacy', () => {
    const c = loadConfig({
      dashboardConfig: { home: { thermostat: { deviceId: 'new' } } },
      nspanelConfig: { chips: [{ device: 'old', capability: 'onoff', icon: '' }] },
    });
    expect(c.home.thermostat).toEqual({ deviceId: 'new' });
    expect(c.home.chips[0]).toBeNull();
    expect(loadConfig({}).home.chips[0]).toBeNull();
  });

  test('watchedCapabilities includes thermostat and dedupes', () => {
    const c = normalizeConfig({
      home: {
        thermostat: { deviceId: 't' },
        chips: [{ deviceId: 'd', capability: 'onoff', icon: '' }],
        values: [{ deviceId: 'd', capability: 'onoff', icon: '', unit: '' }],
      },
    });
    expect(watchedCapabilities(c).map((r) => capKey(r.deviceId, r.capability))).toEqual([
      'd:onoff', 't:measure_temperature', 't:target_temperature',
    ]);
  });
});
