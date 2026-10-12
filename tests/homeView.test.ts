import { describe, expect, test } from 'bun:test';
import { normalizeConfig } from '../lib/config';
import { buildHomeProps, HomeState } from '../lib/panel/homeView';
import icons from '../lib/icons.json';

const TZ = 'Europe/Brussels';
const NOW = new Date('2026-10-12T08:00:00Z');
const base: HomeState = {
  lang: 'nl', dateText: 'maandag 12 oktober', values: new Map(), weather: null, panelTemperature: null,
  events: null, now: NOW, timeZone: TZ, h24: true,
};
const at = (iso: string, title: string, allDay = false) => ({ start: new Date(iso), end: new Date(iso), allDay, title });

describe('buildHomeProps v2', () => {
  test('labels and date', () => {
    const p = buildHomeProps(normalizeConfig({}), base);
    expect(p['home.date.txt']).toBe('maandag 12 oktober');
    expect(p['home.in_lbl.txt']).toBe('BINNEN');
    expect(p['home.nx_lbl.txt']).toBe('STRAKS');
    expect(buildHomeProps(normalizeConfig({}), { ...base, lang: 'en' })['home.nx_lbl.txt']).toBe('UP NEXT');
  });

  test('weather icon glyph, temperature and high/low', () => {
    const p = buildHomeProps(normalizeConfig({}), { ...base, weather: { temperature: 12.6, code: 2, isDay: true, high: 16.2, low: 7.6 } });
    expect(p['home.wx_icon.txt']).toBe((icons as Record<string, string>)['weather-partly-cloudy']);
    expect(p['home.wx_temp.txt']).toBe('13°');
    expect(p['home.wx_hilo.txt']).toBe('max 16° · min 8°');
    const none = buildHomeProps(normalizeConfig({}), base);
    expect([none['home.wx_icon.txt'], none['home.wx_temp.txt'], none['home.wx_hilo.txt']]).toEqual(['', '', '']);
  });

  test('inside card: thermostat current and target', () => {
    const cfg = normalizeConfig({ home: { thermostat: { deviceId: 't' } } });
    const p = buildHomeProps(cfg, { ...base, values: new Map([['t:measure_temperature', 21.46], ['t:target_temperature', 20]]) });
    expect(p['home.in_cur.txt']).toBe('21,5°');
    expect(p['home.in_tgt.txt']).toBe('» 20,0°');
    const panelOnly = buildHomeProps(normalizeConfig({}), { ...base, panelTemperature: 19 });
    expect([panelOnly['home.in_cur.txt'], panelOnly['home.in_tgt.txt']]).toEqual(['19,0°', '']);
  });

  test('chips: active glyphs joined by a space', () => {
    const cfg = normalizeConfig({ home: { chips: [
      { deviceId: 'a', capability: 'onoff', icon: 'A' }, { deviceId: 'b', capability: 'onoff', icon: 'B' }, { deviceId: 'c', capability: 'onoff', icon: 'C' },
    ] } });
    const p = buildHomeProps(cfg, { ...base, values: new Map<string, unknown>([['a:onoff', true], ['b:onoff', false], ['c:onoff', true]]) });
    expect(p['home.chips.txt']).toBe('A C');
  });

  test('up next: today shows time, later events show the day; second line combines', () => {
    const p = buildHomeProps(normalizeConfig({}), {
      ...base, events: [at('2026-10-12T16:00:00Z', 'Zwemles'), at('2026-10-13T06:30:00Z', 'Tandarts')],
    });
    expect([p['home.nx1_t.txt'], p['home.nx1.txt'], p['home.nx2.txt']]).toEqual(['18:00', 'Zwemles', 'morgen 08:30 Tandarts']);
  });

  test('up next: first event on another day uses short day, all-day uses label', () => {
    const p = buildHomeProps(normalizeConfig({}), {
      ...base, events: [at('2026-10-14T22:00:00Z', 'Oma jarig', true), at('2026-10-15T17:00:00Z', 'Etentje bij Jan en Lies op het terras')],
    });
    expect(p['home.nx1_t.txt']).toBe('do 15');
    expect(p['home.nx1.txt']).toBe('Oma jarig');
    expect(p['home.nx2.txt']).toBe('do 15 okt 19:00 Etentje bij Jan …');
  });

  test('up next: empty or unconfigured calendar', () => {
    for (const events of [null, []]) {
      const p = buildHomeProps(normalizeConfig({}), { ...base, events });
      expect([p['home.nx1_t.txt'], p['home.nx1.txt'], p['home.nx2.txt']]).toEqual(['', 'Geen afspraken', '']);
    }
  });
});
