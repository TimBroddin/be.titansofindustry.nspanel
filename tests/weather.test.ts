import { describe, expect, test } from 'bun:test';
import { fetchWeather, weatherPicture } from '../lib/weather';

describe('weatherPicture', () => {
  test.each([
    [0, true, 2], [0, false, 15], [2, true, 11], [2, false, 12], [3, true, 3], [45, true, 8],
    [61, true, 4], [65, true, 5], [81, true, 5], [71, true, 6], [67, true, 7], [95, true, 13],
    [95, false, 14], [99, true, 10], [12345, true, 2],
  ])('code %i day=%p → %i', (code, isDay, pic) => {
    expect(weatherPicture(code as number, isDay as boolean)).toBe(pic as number);
  });
});

describe('fetchWeather', () => {
  test('parses current conditions', async () => {
    let requested = '';
    const w = await fetchWeather(51.05, 3.72, async (url) => {
      requested = url;
      return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 12.4, weather_code: 3, is_day: 0 } }) };
    });
    expect(requested).toContain('latitude=51.05');
    expect(requested).toContain('current=temperature_2m,weather_code,is_day');
    expect(w).toEqual({ temperature: 12.4, code: 3, isDay: false });
  });

  test('throws on HTTP error and on malformed body', async () => {
    await expect(fetchWeather(0, 0, async () => ({ ok: false, status: 503, json: async () => ({}) }))).rejects.toThrow('503');
    await expect(fetchWeather(0, 0, async () => ({ ok: true, status: 200, json: async () => ({}) }))).rejects.toThrow('unexpected');
  });
});
