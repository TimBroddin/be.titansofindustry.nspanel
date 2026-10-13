import { describe, expect, test } from 'bun:test';
import { settingsLayout } from '../design/settingsLayout';

const { searchIcons, SUGGESTED_ICONS } = require('../settings/iconSearch.js');
const { groupCapabilities } = require('../settings/capabilities.js');
const { previewItems } = require('../settings/preview.js');

describe('searchIcons', () => {
  const names = ['lightbulb', 'lightbulb-outline', 'ceiling-light', 'light-switch', 'door-open', 'flash-light', 'palette'];

  test('ranks exact, then prefix, then word-prefix, then substring', () => {
    expect(searchIcons('light', names, 10)).toEqual(['light-switch', 'lightbulb', 'lightbulb-outline', 'flash-light', 'ceiling-light']);
    expect(searchIcons('lightbulb', names, 10)).toEqual(['lightbulb', 'lightbulb-outline']);
  });

  test('is case-insensitive, trims, and respects the limit', () => {
    expect(searchIcons('  DOOR ', names, 10)).toEqual(['door-open']);
    expect(searchIcons('l', names, 2)).toHaveLength(2);
  });

  test('empty query returns the suggested icons that exist', () => {
    expect(searchIcons('', names, 10)).toEqual(SUGGESTED_ICONS.filter((n: string) => names.includes(n)));
  });
});

describe('groupCapabilities', () => {
  test('boolean capabilities are suggested (onoff first, then alarms), others separate, titles kept', () => {
    const device = {
      capabilities: ['measure_power', 'alarm_contact', 'onoff', 'dim', 'alarm_battery'],
      capabilitiesObj: {
        measure_power: { title: 'Power', type: 'number' },
        alarm_contact: { title: 'Contact alarm', type: 'boolean' },
        onoff: { title: 'Turned on', type: 'boolean' },
        dim: { title: 'Dim level', type: 'number' },
        alarm_battery: { title: 'Battery alarm', type: 'boolean' },
      },
    };
    expect(groupCapabilities(device)).toEqual({
      suggested: [
        { id: 'onoff', title: 'Turned on' },
        { id: 'alarm_battery', title: 'Battery alarm' },
        { id: 'alarm_contact', title: 'Contact alarm' },
      ],
      other: [
        { id: 'dim', title: 'Dim level' },
        { id: 'measure_power', title: 'Power' },
      ],
    });
  });

  test('missing capabilitiesObj falls back to ids', () => {
    expect(groupCapabilities({ capabilities: ['onoff'], capabilitiesObj: {} })).toEqual({ suggested: [], other: [{ id: 'onoff', title: 'onoff' }] });
  });
});

describe('previewItems', () => {
  const layout = settingsLayout();
  const display = (glyph: string) => (glyph ? `<${glyph}>` : '');
  const ctx = {
    time: '13:42', date: 'maandag 12 oktober', display, iconChar: (name: string) => `[${name}]`,
    labels: { inside: 'BINNEN', next: 'STRAKS', moods: 'Sferen' }, thermostatName: 'Netatmo',
  };

  test('home: clock, date, chips as icons, thermostat target only when configured', () => {
    const config = { home: { thermostat: { deviceId: 't' }, chips: [{ icon: 'A' }, null, { icon: 'B' }] }, moods: [] };
    const items = Object.fromEntries(previewItems('home', layout, config, ctx).map((i: any) => [i.name, i]));
    expect(items.time.text).toBe('13:42');
    expect(items.date.text).toBe('maandag 12 oktober');
    expect(items.chips.text).toBe('<A> <B>');
    expect(items.chips.icon).toBe(true);
    expect(items.in_lbl.text).toBe('BINNEN');
    expect(items.in_tgt.text).toBe('» 20,0°');
    expect(items.wx_icon.text).toBe('[weather-partly-cloudy]');
    const noThermostat = Object.fromEntries(previewItems('home', layout, { ...config, home: { ...config.home, thermostat: null } }, ctx).map((i: any) => [i.name, i]));
    expect(noThermostat.in_tgt.text).toBe('');
  });

  test('moods: title, tile icons and labels; empty slots blank', () => {
    const config = { home: { chips: [] }, moods: [{ type: 'mood', icon: 'F', label: 'Film' }, null] };
    const items = Object.fromEntries(previewItems('moods', layout, config, ctx).map((i: any) => [i.name, i]));
    expect(items.title.text).toBe('Sferen');
    expect([items.i01.text, items.l01.text, items.i01.icon]).toEqual(['<F>', 'Film', true]);
    expect([items.i02.text, items.l02.text]).toEqual(['', '']);
  });

  test('items carry position, pixel font size and colour from the layout', () => {
    const time = previewItems('home', layout, { home: { chips: [] }, moods: [] }, ctx).find((i: any) => i.name === 'time');
    expect(time).toMatchObject({ x: 18, y: 14, w: 236, h: 88, px: 80, color: '#e9eef7', align: 'left' });
  });
});

describe('settings/layout.json', () => {
  test('is generated from design/layout.ts and up to date', async () => {
    expect(await Bun.file('settings/layout.json').json()).toEqual(settingsLayout());
  });
});
