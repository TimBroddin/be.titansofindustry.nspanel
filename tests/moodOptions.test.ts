import { describe, expect, test } from 'bun:test';

const { targetChoices } = require('../settings/moodOptions.js');

const data = {
  moods: [{ id: 'm1', name: 'Film', zone: 'Woonkamer' }],
  flows: [{ id: 'f1', name: 'Eten', advanced: true }],
  toggles: [{ id: 'd1', name: 'Keukenlicht', zone: 'Keuken' }],
};

describe('targetChoices', () => {
  test('lists the right kind of target per tile type', () => {
    expect(targetChoices('mood', data, 'm1').map((c: any) => [c.value, c.label])).toEqual([['', '—'], ['m1', 'Woonkamer · Film']]);
    expect(targetChoices('flow', data, '')[1]).toEqual({ value: 'f1', name: 'Eten', label: 'Eten (advanced)', advanced: true });
    expect(targetChoices('toggle', data, '').map((c: any) => c.value)).toEqual(['', 'd1']);
  });

  test('keeps a stored id that is not in the list, so saving does not drop the tile', () => {
    const choices = targetChoices('mood', { ...data, moods: [] }, 'gone-id');
    expect(choices).toEqual([{ value: '', label: '—' }, { value: 'gone-id', label: '(missing: gone-id)' }]);
  });

  test('keeps the advanced flag for a missing flow', () => {
    expect(targetChoices('flow', { ...data, flows: [] }, 'f9', true)[1]).toEqual({ value: 'f9', label: '(missing: f9)', advanced: true });
  });
});

describe('tile label defaults', () => {
  const { nextLabel } = require('../settings/moodOptions.js');

  test('choices carry the plain name (no zone) for use as label', () => {
    expect(targetChoices('mood', data, '')[1].name).toBe('Film');
    expect(targetChoices('toggle', data, '')[1].name).toBe('Keukenlicht');
    expect(targetChoices('flow', data, '')[1].name).toBe('Eten');
  });

  test('empty label or the previous default takes the new name; a custom label is kept', () => {
    expect(nextLabel('', '', 'Film')).toBe('Film');
    expect(nextLabel('  ', 'Oud', 'Film')).toBe('Film');
    expect(nextLabel('Keukenlicht', 'Keukenlicht', 'Eettafel')).toBe('Eettafel');
    expect(nextLabel('Kino!', 'Film', 'Hawaii')).toBe('Kino!');
  });
});

describe('device icon defaults', () => {
  const { deviceIconKey, defaultIcon } = require('../settings/moodOptions.js');

  test('driver id maps to the key the icon fetcher used', () => {
    expect(deviceIconKey('homey:app:nl.philips.hue:bulb')).toBe('device-icons/nl.philips.hue/bulb');
    expect(deviceIconKey('homey:app:com.xiaomi-mi:remote.b28ac1')).toBe('device-icons/com.xiaomi-mi/remote.b28ac1');
    expect(deviceIconKey('homey:manager:vdevice:x')).toBe('device-icons/vdevice/x');
  });

  test('keeps a chosen icon, otherwise uses the device icon when the panel font has it', () => {
    const icons = { 'device-icons/nl.philips.hue/bulb': 'B' };
    expect(defaultIcon('', 'homey:app:nl.philips.hue:bulb', icons)).toBe('B');
    expect(defaultIcon('X', 'homey:app:nl.philips.hue:bulb', icons)).toBe('X');
    expect(defaultIcon('', 'homey:app:unknown:thing', icons)).toBe('');
  });
});
