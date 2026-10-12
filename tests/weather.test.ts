import { describe, expect, test } from 'bun:test';
import { fetchWeather, weatherIcon } from '../lib/weather';

describe('weatherIcon', () => {
  test.each([
    [0, true, 'weather-sunny'], [0, false, 'weather-night'], [2, true, 'weather-partly-cloudy'], [2, false, 'weather-night-partly-cloudy'],
    [3, true, 'weather-cloudy'], [45, true, 'weather-fog'], [61, true, 'weather-rainy'], [65, true, 'weather-pouring'],
    [71, true, 'weather-snowy'], [67, true, 'weather-snowy-rainy'], [95, true, 'weather-lightning-rainy'], [99, true, 'weather-hail'],
    [12345, true, 'weather-sunny'],
  ])('code %i day=%p → %s', (code, isDay, name) => {
    expect(weatherIcon(code as number, isDay as boolean)).toBe(name as string);
  });
});

describe('fetchWeather', () => {
  test('parses current conditions', async () => {
    let requested = '';
    const w = await fetchWeather(51.05, 3.72, async (url) => {
      requested = url;
      return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 12.4, weather_code: 3, is_day: 0 }, daily: { temperature_2m_max: [16.2], temperature_2m_min: [7.6] } }) };
    });
    expect(requested).toContain('latitude=51.05');
    expect(requested).toContain('current=temperature_2m,weather_code,is_day');
    expect(requested).toContain('daily=temperature_2m_max,temperature_2m_min');
    expect(w).toEqual({ temperature: 12.4, code: 3, isDay: false, high: 16.2, low: 7.6 });
  });

  test('throws on HTTP error and on malformed body', async () => {
    await expect(fetchWeather(0, 0, async () => ({ ok: false, status: 503, json: async () => ({}) }))).rejects.toThrow('503');
    await expect(fetchWeather(0, 0, async () => ({ ok: true, status: 200, json: async () => ({}) }))).rejects.toThrow('unexpected');
  });
});
