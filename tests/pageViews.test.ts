import { describe, expect, test } from 'bun:test';
import { normalizeConfig } from '../lib/config';
import { buildCalendarProps } from '../lib/panel/calendarView';
import { buildClimateProps } from '../lib/panel/climateView';
import { buildMoodsProps } from '../lib/panel/moodsView';

const TZ = 'Europe/Brussels';
const NOW = new Date('2026-10-12T08:00:00Z');
const PICS = { off: 3, on: 4 };
const FONTS = { small: 9, body: 8 };

describe('buildMoodsProps', () => {
  const cfg = normalizeConfig({ moods: [
    { type: 'mood', moodId: 'm1', icon: 'F', label: 'Film' },
    null,
    { type: 'toggle', deviceId: 'd', icon: 'L', label: 'Keukenlicht' },
  ] });

  test('title, glyphs, labels and on/off crop pictures', () => {
    const p = buildMoodsProps(cfg, [false, false, true, false, false, false, false, false], 'nl', PICS);
    expect(p['moods.title.txt']).toBe('Sferen');
    expect([p['moods.i01.txt'], p['moods.l01.txt'], p['moods.i01.picc'], p['moods.l01.picc']]).toEqual(['F', 'Film', '3', '3']);
    expect([p['moods.i02.txt'], p['moods.l02.txt']]).toEqual(['', '']);
    expect([p['moods.i03.picc'], p['moods.l03.picc']]).toEqual(['4', '4']);
    expect(p['moods.l08.txt']).toBe('');
  });

  test('without picture ids no picc props are sent', () => {
    const p = buildMoodsProps(cfg, Array(8).fill(false), 'en', null);
    expect(p['moods.title.txt']).toBe('Moods');
    expect(Object.keys(p).some((k) => k.endsWith('.picc'))).toBe(false);
  });
});

describe('buildClimateProps', () => {
  const thermostat = { name: 'Netatmo thermostaat', zone: 'Woonkamer', min: 7, max: 30, step: 0.5 };

  test('labels, target, status and Nextion variables', () => {
    const p = buildClimateProps({ lang: 'nl', current: 21.46, target: 20, thermostat, outside: 12.6 });
    expect(p['climate.title.txt']).toBe('Klimaat');
    expect(p['climate.tgt_lbl.txt']).toBe('DOEL');
    expect(p['climate.tgt_txt.txt']).toBe('20,0°');
    expect(p['climate.status.txt']).toBe('Op temperatuur · nu 21,5°');
    expect(p['climate.room_lbl.txt']).toBe('WOONKAMER');
    expect(p['climate.room.txt']).toBe('Netatmo thermostaat');
    expect(p['climate.info.txt']).toBe('buiten 13°');
    expect([p['climate.tgt.val'], p['climate.tmin.val'], p['climate.tmax.val'], p['climate.tstep.val'], p['climate.dsep.txt']])
      .toEqual(['200', '70', '300', '5', ',']);
  });

  test('heating status and English decimal separator', () => {
    const p = buildClimateProps({ lang: 'en', current: 19, target: 20.5, thermostat, outside: null });
    expect(p['climate.status.txt']).toBe('Heating · now 19.0°');
    expect(p['climate.tgt_txt.txt']).toBe('20.5°');
    expect(p['climate.dsep.txt']).toBe('.');
    expect(p['climate.info.txt']).toBe('');
  });

  test('no thermostat configured', () => {
    const p = buildClimateProps({ lang: 'nl', current: null, target: null, thermostat: null, outside: null });
    expect(p['climate.status.txt']).toBe('Geen thermostaat');
    expect(p['climate.tgt_txt.txt']).toBe('--');
    expect(p['climate.tgt.val']).toBeUndefined();
  });
});

describe('buildCalendarProps', () => {
  const ev = (iso: string, title: string, allDay = false) => ({ start: new Date(iso), end: new Date(iso), allDay, title });

  test('groups by day with headers, times in amber, all-day muted', () => {
    const p = buildCalendarProps([
      ev('2026-10-12T16:00:00Z', 'Zwemles'), ev('2026-10-12T18:30:00Z', 'Oudercontact'),
      ev('2026-10-13T06:30:00Z', 'Tandarts'), ev('2026-10-13T22:00:00Z', 'Oma jarig', true),
    ], { now: NOW, lang: 'nl', timeZone: TZ, h24: true, fonts: FONTS });
    const row = (n: string) => [p[`calendar.t${n}.txt`], p[`calendar.e${n}.txt`], p[`calendar.t${n}.pco`], p[`calendar.t${n}.font`]];
    expect(p['calendar.title.txt']).toBe('Agenda');
    expect(row('01')).toEqual(['VANDAAG', '', '40345', '9']);
    expect(row('02')).toEqual(['18:00', 'Zwemles', '62893', '8']);
    expect(row('03')).toEqual(['20:30', 'Oudercontact', '62893', '8']);
    expect(row('04')).toEqual(['MORGEN', '', '40345', '9']);
    expect(row('05')).toEqual(['08:30', 'Tandarts', '62893', '8']);
    expect(row('06')).toEqual(['WO 14 OKT', '', '40345', '9']);
    expect(row('07')).toEqual(['hele dag', 'Oma jarig', '40345', '8']);
    expect(row('08')).toEqual(['', '', '40345', '8']);
  });

  test('never ends on a lone header, truncates long titles, and shows ongoing multi-day events today', () => {
    const many = Array.from({ length: 6 }, (_, i) => ev(`2026-10-12T1${i}:00:00Z`, i === 0 ? 'Een heel lange titel die echt niet past op de regel' : `E${i}`));
    const p = buildCalendarProps([ev('2026-10-09T22:00:00Z', 'Herfstvakantie', true), ...many, ev('2026-10-13T08:00:00Z', 'Morgen')],
      { now: NOW, lang: 'nl', timeZone: TZ, h24: true, fonts: FONTS });
    expect(p['calendar.t01.txt']).toBe('VANDAAG');
    expect(p['calendar.e02.txt']).toBe('Herfstvakantie');
    expect(p['calendar.e03.txt']).toBe('Een heel lange titel die ec…');
    expect(p['calendar.t08.txt']).not.toBe('MORGEN');
  });

  test('stale data marks the title', () => {
    const p = buildCalendarProps([], { now: NOW, lang: 'nl', timeZone: TZ, h24: true, fonts: null, stale: true });
    expect(p['calendar.title.txt']).toBe('Agenda !');
  });

  test('empty calendar shows a message in row 1; no font props without font ids', () => {
    const p = buildCalendarProps([], { now: NOW, lang: 'en', timeZone: TZ, h24: true, fonts: null });
    expect([p['calendar.t01.txt'], p['calendar.e01.txt']]).toEqual(['', 'No events']);
    expect(Object.keys(p).some((k) => k.endsWith('.font'))).toBe(false);
  });
});
