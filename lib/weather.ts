export interface WeatherNow { temperature: number; code: number; isDay: boolean; high?: number; low?: number }
export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function fetchWeather(lat: number, lon: number, fetchFn: FetchFn = fetch): Promise<WeatherNow> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  /* eslint-disable camelcase -- Open-Meteo field names */
  const data = await res.json() as {
    current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown };
    daily?: { temperature_2m_max?: unknown[]; temperature_2m_min?: unknown[] };
  };
  /* eslint-enable camelcase */
  const c = data.current;
  if (!c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') {
    throw new Error('Open-Meteo: unexpected response');
  }
  const w: WeatherNow = { temperature: c.temperature_2m, code: c.weather_code, isDay: c.is_day !== 0 };
  const high = data.daily?.temperature_2m_max?.[0];
  const low = data.daily?.temperature_2m_min?.[0];
  if (typeof high === 'number') w.high = high;
  if (typeof low === 'number') w.low = low;
  return w;
}

// WMO weather code → MDI icon name (glyph looked up in lib/icons.json).
export function weatherIcon(code: number, isDay: boolean): string {
  switch (code) {
    case 0: return isDay ? 'weather-sunny' : 'weather-night';
    case 1: case 2: return isDay ? 'weather-partly-cloudy' : 'weather-night-partly-cloudy';
    case 3: return 'weather-cloudy';
    case 45: case 48: return 'weather-fog';
    case 51: case 53: case 55: case 61: case 63: case 80: case 81: return 'weather-rainy';
    case 65: case 82: return 'weather-pouring';
    case 71: case 73: case 75: case 77: case 85: case 86: return 'weather-snowy';
    case 56: case 57: case 66: case 67: return 'weather-snowy-rainy';
    case 95: return 'weather-lightning-rainy';
    case 96: case 99: return 'weather-hail';
    default: return isDay ? 'weather-sunny' : 'weather-night';
  }
}
