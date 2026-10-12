import { describe, expect, test } from 'bun:test';
import { formatDate, formatNumber, formatValue, isActive, t, toLang } from '../lib/i18n';

const MON_NOON = new Date('2026-10-12T10:00:00Z');

describe('i18n', () => {
  test('toLang defaults to nl', () => {
    expect(toLang('en')).toBe('en');
    expect(toLang('fr')).toBe('nl');
    expect(toLang(undefined)).toBe('nl');
  });

  test('strings', () => {
    expect(t('nl', 'on')).toBe('Aan');
    expect(t('en', 'off')).toBe('Off');
  });

  test('formatDate default format per language', () => {
    expect(formatDate(MON_NOON, 'ddd DD MMM', 'en', 'Europe/Brussels')).toBe('Mon 12 Oct');
    expect(formatDate(MON_NOON, 'ddd DD MMM', 'nl', 'Europe/Brussels')).toBe('ma 12 okt');
  });

  test('formatDate numeric formats', () => {
    expect(formatDate(MON_NOON, 'DD/MM/YYYY', 'nl', 'Europe/Brussels')).toBe('12/10/2026');
    expect(formatDate(MON_NOON, 'MM/DD/YYYY', 'en', 'Europe/Brussels')).toBe('10/12/2026');
    expect(formatDate(MON_NOON, 'YYYY-MM-DD', 'en', 'Europe/Brussels')).toBe('2026-10-12');
    expect(formatDate(MON_NOON, 'DD MMM YYYY', 'nl', 'Europe/Brussels')).toBe('12 okt 2026');
  });

  test('formatDate uses the given timezone, not UTC', () => {
    const lateUtc = new Date('2026-10-12T23:30:00Z'); // 01:30 on the 13th in Brussels
    expect(formatDate(lateUtc, 'ddd DD MMM', 'nl', 'Europe/Brussels')).toBe('di 13 okt');
    expect(formatDate(lateUtc, 'YYYY-MM-DD', 'nl', 'UTC')).toBe('2026-10-12');
  });

  test('formatNumber uses locale decimal separator', () => {
    expect(formatNumber(21.46, 1, 'nl')).toBe('21,5');
    expect(formatNumber(21.46, 1, 'en')).toBe('21.5');
    expect(formatNumber(1234, 0, 'nl')).toBe('1234');
  });

  test('formatValue', () => {
    expect(formatValue(null, { lang: 'nl' })).toBe('--');
    expect(formatValue(true, { lang: 'nl' })).toBe('Aan');
    expect(formatValue(1500, { lang: 'nl', unit: ' W' })).toBe('1500 W');
    expect(formatValue(21.25, { lang: 'nl', unit: '°' })).toBe('21,3°');
    expect(formatValue('heat', { lang: 'en' })).toBe('heat');
  });

  test('isActive', () => {
    expect(isActive(true)).toBe(true);
    expect(isActive(false)).toBe(false);
    expect(isActive(0)).toBe(false);
    expect(isActive(3)).toBe(true);
    expect(isActive('off')).toBe(false);
    expect(isActive('')).toBe(false);
    expect(isActive('on')).toBe(true);
    expect(isActive(null)).toBe(false);
  });
});
