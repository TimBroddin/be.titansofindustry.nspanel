import en from './en.json';
import nl from './nl.json';

export type Lang = 'nl' | 'en';
type StringKey = keyof typeof en;

const STRINGS: Record<Lang, Record<StringKey, string>> = { nl, en };
const LOCALES: Record<Lang, string> = { nl: 'nl-BE', en: 'en-GB' };

export const toLang = (v: unknown): Lang => (v === 'en' ? 'en' : 'nl');

export const t = (lang: Lang, key: StringKey): string => STRINGS[lang][key];

export function formatDate(date: Date, format: string, lang: Lang, timeZone: string): string {
  const named = new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(date);
  const numeric = new Intl.DateTimeFormat('en-GB', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(date);
  // CLDR abbreviations carry a trailing dot in some locales (nl: "okt.")
  const name = (type: string): string => (named.find((p) => p.type === type)?.value ?? '').replace(/\.$/, '');
  const num = (type: string): string => numeric.find((p) => p.type === type)?.value ?? '';
  const day = String(Number(num('day')));

  switch (format) {
    case 'DD/MM/YYYY': return `${num('day')}/${num('month')}/${num('year')}`;
    case 'MM/DD/YYYY': return `${num('month')}/${num('day')}/${num('year')}`;
    case 'YYYY-MM-DD': return `${num('year')}-${num('month')}-${num('day')}`;
    case 'DD MMM YYYY': return `${day} ${name('month')} ${num('year')}`;
    case 'ddd DD MMM':
    default: return `${name('weekday')} ${day} ${name('month')}`;
  }
}

export function formatNumber(value: number, decimals: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false,
  }).format(value);
}

export function formatValue(value: unknown, opts: { lang: Lang; unit?: string }): string {
  const unit = opts.unit ?? '';
  if (value === null || value === undefined) return '--';
  if (typeof value === 'boolean') return t(opts.lang, value ? 'on' : 'off');
  if (typeof value === 'number') return `${formatNumber(value, Number.isInteger(value) ? 0 : 1, opts.lang)}${unit}`;
  return `${String(value)}${unit}`;
}

export function isActive(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '' && value !== 'off' && value !== 'idle';
  return false;
}

export function formatShortDay(date: Date, lang: Lang, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(date);
  const get = (type: string): string => (parts.find((p) => p.type === type)?.value ?? '').replace(/\.$/, '');
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

export function formatTime(date: Date, h24: boolean, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hourCycle: h24 ? 'h23' : 'h12',
  })
    .format(date).replace(/^(\d):/, h24 ? '0$1:' : '$1:').replace(/\u202f/g, ' ');
}

export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// "Vandaag" / "Morgen" / "do 15 okt" for the day containing `date` (seen from `now`).
export function dayLabel(date: Date, now: Date, lang: Lang, timeZone: string): string {
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return t(lang, 'today');
  if (key === dayKey(new Date(now.getTime() + 86400000), timeZone)) return t(lang, 'tomorrow');
  return formatShortDay(date, lang, timeZone);
}
