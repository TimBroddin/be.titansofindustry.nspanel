import {
  Lang, dayKey, formatShortDay, formatTime, t,
} from '../i18n';
import { CalEvent } from '../sources/calendar';
import { PCO, pad2, truncate } from './text';

export const CAL_ROWS = 8;
const TITLE_MAX = 28;

export interface CalendarViewOptions {
  now: Date;
  lang: Lang;
  timeZone: string;
  h24: boolean;
  fonts: { small: number; body: number } | null;
}

interface Row { time: string; title: string; pco: string; header: boolean }

export function buildCalendarProps(events: CalEvent[], o: CalendarViewOptions): Record<string, string> {
  const today = dayKey(o.now, o.timeZone);
  const tomorrow = dayKey(new Date(o.now.getTime() + 86400000), o.timeZone);
  const keyed = events
    .map((e) => ({ e, key: dayKey(e.start < o.now ? o.now : e.start, o.timeZone) }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.e.start.getTime() - b.e.start.getTime());

  const rows: Row[] = [];
  let lastKey = '';
  for (const { e, key } of keyed) {
    if (key !== lastKey) {
      if (rows.length + 2 > CAL_ROWS) break; // a header needs at least one event under it
      const label = key === today ? t(o.lang, 'today') : key === tomorrow ? t(o.lang, 'tomorrow') : formatShortDay(e.start, o.lang, o.timeZone);
      rows.push({ time: label.toUpperCase(), title: '', pco: PCO.muted, header: true });
      lastKey = key;
    }
    if (rows.length + 1 > CAL_ROWS) break;
    rows.push(e.allDay
      ? { time: t(o.lang, 'allDay'), title: truncate(e.title, TITLE_MAX), pco: PCO.muted, header: false }
      : { time: formatTime(e.start, o.h24, o.timeZone), title: truncate(e.title, TITLE_MAX), pco: PCO.amber, header: false });
  }
  if (rows.length === 0) rows.push({ time: '', title: t(o.lang, 'noEvents'), pco: PCO.muted, header: false });

  const p: Record<string, string> = { 'calendar.title.txt': t(o.lang, 'calendar') };
  for (let i = 0; i < CAL_ROWS; i++) {
    const n = pad2(i + 1);
    const row = rows[i] ?? { time: '', title: '', pco: PCO.muted, header: false };
    p[`calendar.t${n}.txt`] = row.time;
    p[`calendar.e${n}.txt`] = row.title;
    p[`calendar.t${n}.pco`] = row.pco;
    if (o.fonts) p[`calendar.t${n}.font`] = String(row.header ? o.fonts.small : o.fonts.body);
  }
  return p;
}
