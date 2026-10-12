import { DashboardConfig, capKey } from '../config';
import {
  Lang, dayKey, formatNumber, formatShortDay, formatTime, isActive, t,
} from '../i18n';
import icons from '../icons.json';
import { CalEvent } from '../sources/calendar';
import { WeatherNow, weatherIcon } from '../weather';
import { truncate } from './text';

export interface HomeState {
  lang: Lang;
  dateText: string;
  values: ReadonlyMap<string, unknown>;
  weather: WeatherNow | null;
  panelTemperature: number | null;
  events: CalEvent[] | null;
  now: Date;
  timeZone: string;
  h24: boolean;
}

const NX1_MAX = 16;
const NX2_MAX = 33;
const glyph = (name: string): string => (icons as Record<string, string>)[name] ?? '';

export function buildHomeProps(config: DashboardConfig, s: HomeState): Record<string, string> {
  const { lang } = s;
  const get = (deviceId: string, capability: string): unknown => s.values.get(capKey(deviceId, capability));
  const deg = (v: number, decimals: number): string => `${formatNumber(v, decimals, lang)}°`;
  const p: Record<string, string> = {};

  p['home.date.txt'] = s.dateText;
  p['home.in_lbl.txt'] = t(lang, 'inside').toUpperCase();
  p['home.nx_lbl.txt'] = t(lang, 'next').toUpperCase();

  const w = s.weather;
  p['home.wx_icon.txt'] = w ? glyph(weatherIcon(w.code, w.isDay)) : '';
  p['home.wx_temp.txt'] = w ? deg(Math.round(w.temperature), 0) : '';
  p['home.wx_hilo.txt'] = w && typeof w.high === 'number' && typeof w.low === 'number'
    ? `${t(lang, 'max')} ${deg(Math.round(w.high), 0)} · ${t(lang, 'min')} ${deg(Math.round(w.low), 0)}` : '';

  const thermostat = config.home.thermostat;
  const current = thermostat ? get(thermostat.deviceId, 'measure_temperature') : undefined;
  const target = thermostat ? get(thermostat.deviceId, 'target_temperature') : undefined;
  const indoor = typeof current === 'number' ? current : s.panelTemperature;
  p['home.in_cur.txt'] = typeof indoor === 'number' ? deg(indoor, 1) : '';
  p['home.in_tgt.txt'] = typeof target === 'number' ? `» ${deg(target, 1)}` : '';

  p['home.chips.txt'] = config.home.chips
    .filter((c) => c && isActive(get(c.deviceId, c.capability)))
    .map((c) => c!.icon).join(' ');

  const [first, second] = s.events ?? [];
  const today = dayKey(s.now, s.timeZone);
  const tomorrow = dayKey(new Date(s.now.getTime() + 86400000), s.timeZone);
  const keyOf = (e: CalEvent): string => dayKey(e.start < s.now ? s.now : e.start, s.timeZone);
  if (!first) {
    p['home.nx1_t.txt'] = '';
    p['home.nx1.txt'] = t(lang, 'noEvents');
    p['home.nx2.txt'] = '';
  } else {
    const isToday = keyOf(first) === today;
    p['home.nx1_t.txt'] = isToday
      ? (first.allDay ? '' : formatTime(first.start, s.h24, s.timeZone))
      : formatShortDay(first.start, lang, s.timeZone).split(' ').slice(0, 2).join(' ');
    p['home.nx1.txt'] = truncate(first.title, NX1_MAX);
    if (second) {
      const key = keyOf(second);
      const day = key === today ? '' : key === tomorrow ? t(lang, 'tomorrow').toLowerCase() : formatShortDay(second.start, lang, s.timeZone);
      const time = second.allDay ? t(lang, 'allDay') : formatTime(second.start, s.h24, s.timeZone);
      p['home.nx2.txt'] = truncate([day, time, second.title].filter(Boolean).join(' '), NX2_MAX);
    } else {
      p['home.nx2.txt'] = '';
    }
  }
  return p;
}
