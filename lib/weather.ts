export interface WeatherNow { temperature: number; code: number; isDay: boolean }
export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function fetchWeather(lat: number, lon: number, fetchFn: FetchFn = fetch): Promise<WeatherNow> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code,is_day&timezone=auto';
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  // eslint-disable-next-line camelcase -- Open-Meteo field names
  const data = await res.json() as { current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown } };
  const c = data.current;
  if (!c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') {
    throw new Error('Open-Meteo: unexpected response');
  }
  return { temperature: c.temperature_2m, code: c.weather_code, isDay: c.is_day !== 0 };
}

// WMO weather code → picture id in the Blackymas TFT (see blueprint `nextion.pic.weather`).
export function weatherPicture(code: number, isDay: boolean): number {
  switch (code) {
    case 0: return isDay ? 2 : 15; // clear
    case 1: case 2: return isDay ? 11 : 12; // partly cloudy
    case 3: return 3; // cloudy
    case 45: case 48: return 8; // fog
    case 51: case 53: case 55: case 61: case 63: return 4; // rainy
    case 65: case 80: case 81: case 82: return 5; // pouring
    case 71: case 73: case 75: case 77: case 85: case 86: return 6; // snowy
    case 56: case 57: case 66: case 67: return 7; // snowy-rainy
    case 95: return isDay ? 13 : 14; // lightning-rainy
    case 96: case 99: return 10; // lightning (with hail)
    default: return isDay ? 2 : 15;
  }
}
