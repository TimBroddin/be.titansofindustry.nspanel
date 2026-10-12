import { describe, expect, test } from 'bun:test';
import { normalizeConfig } from '../lib/config';
import { ICON_THERMOMETER, buildHomeProps, HomeState } from '../lib/panel/homeView';

const base: HomeState = { lang: 'nl', dateText: 'ma 12 okt', values: new Map(), weather: null, panelTemperature: null };

describe('buildHomeProps', () => {
  test('hides Blackymas chrome we do not use', () => {
    const p = buildHomeProps(normalizeConfig({}), base);
    expect(p['home.button01.vis']).toBe('0');
    expect(p['home.button07.vis']).toBe('0');
    expect(p['home.bt_notific.vis']).toBe('0');
    expect(p['home.bt_utilities.vis']).toBe('0');
    expect(p['home.date.txt']).toBe('ma 12 okt');
  });

  test('weather present and absent', () => {
    expect(buildHomeProps(normalizeConfig({}), base)['home.weather.vis']).toBe('0');
    const p = buildHomeProps(normalizeConfig({}), { ...base, weather: { temperature: 12.6, code: 3, isDay: true } });
    expect(p['home.outdoor_temp.txt']).toBe('13°');
    expect(p['home.weather.pic']).toBe('3');
    expect(p['home.weather.vis']).toBe('1');
  });

  test('indoor temp prefers thermostat, falls back to panel sensor', () => {
    const cfg = normalizeConfig({ home: { thermostat: { deviceId: 't' } } });
    const withThermo = buildHomeProps(cfg, { ...base, panelTemperature: 19, values: new Map([['t:measure_temperature', 21.46]]) });
    expect(withThermo['home.indr_temp.txt']).toBe('21,5°');
    expect(withThermo['home.indr_temp_icon.txt']).toBe(ICON_THERMOMETER);
    expect(buildHomeProps(cfg, { ...base, panelTemperature: 19 })['home.indr_temp.txt']).toBe('19,0°');
    expect(buildHomeProps(normalizeConfig({}), base)['home.indr_temp.txt']).toBe('');
  });

  test('chips show their icon only when active', () => {
    const cfg = normalizeConfig({ home: { chips: [
      { deviceId: 'a', capability: 'alarm_contact', icon: 'D' },
      { deviceId: 'b', capability: 'onoff', icon: 'L' },
    ] } });
    const p = buildHomeProps(cfg, { ...base, values: new Map<string, unknown>([['a:alarm_contact', true], ['b:onoff', false]]) });
    expect(p['home.chip01.txt']).toBe('D');
    expect(p['home.chip02.txt']).toBe('');
    expect(p['home.chip07.txt']).toBe('');
  });

  test('values render formatted text and icon; unknown values show --', () => {
    const cfg = normalizeConfig({ home: { values: [
      { deviceId: 'p', capability: 'measure_power', icon: 'P', unit: ' W' },
      { deviceId: 'gone', capability: 'measure_power', icon: 'G', unit: ' W' },
    ] } });
    const p = buildHomeProps(cfg, { ...base, values: new Map([['p:measure_power', 1500]]) });
    expect(p['home.value01.txt']).toBe('1500 W');
    expect(p['home.value01_icon.txt']).toBe('P');
    expect(p['home.value02.txt']).toBe('--');
    expect(p['home.value03.txt']).toBe('');
    expect(p['home.value03_icon.txt']).toBe('');
  });
});
