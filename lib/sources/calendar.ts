/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const ICAL = require('ical.js');
/* eslint-enable @typescript-eslint/no-var-requires */

export interface CalEvent { start: Date; end: Date; allDay: boolean; title: string }

export type TextFetch = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export const MAX_EVENTS = 20;
const MAX_ITERATIONS = 200000; // a daily series since 2018 is ~3,000 steps; hourly ~80,000

export async function fetchCalendar(url: string, fetchFn: TextFetch = fetch): Promise<string> {
  const res = await fetchFn(url.replace(/^webcal:\/\//i, 'https://'));
  if (!res.ok) throw new Error(`Calendar HTTP ${res.status}`);
  return res.text();
}

// Offset (ms) of `timeZone` from UTC at the given instant.
function tzOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs;
}

// Wall-clock time in `timeZone` → instant.
function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = guess - tzOffset(guess, timeZone);
  utc = guess - tzOffset(utc, timeZone); // second pass settles DST edges
  return new Date(utc);
}

function toDate(t: any, timeZone: string): Date {
  const floating = !t.zone || t.zone === ICAL.Timezone.localTimezone;
  if (t.isDate) return zoned(t.year, t.month, t.day, 0, 0, 0, timeZone);
  if (floating) return zoned(t.year, t.month, t.day, t.hour, t.minute, t.second, timeZone);
  return new Date(t.toUnixTime() * 1000);
}

export function parseUpcoming(ics: string, now: Date, days: number, timeZone: string): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const vtz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(vtz);

  const windowEnd = new Date(now.getTime() + days * 86400000);
  const vevents = root.getAllSubcomponents('vevent');
  const overrides = vevents.filter((v: any) => v.hasProperty('recurrence-id'));
  const out: CalEvent[] = [];

  const consider = (startT: any, endT: any, title: string): void => {
    const start = toDate(startT, timeZone);
    const end = endT ? toDate(endT, timeZone) : start;
    if (end > now && start < windowEnd) {
      out.push({
        start, end, allDay: Boolean(startT.isDate), title,
      });
    }
  };

  for (const v of vevents) {
    if (v.hasProperty('recurrence-id')) continue;
    const event = new ICAL.Event(v);
    const own = overrides.filter((o: any) => o.getFirstPropertyValue('uid') === event.uid);
    for (const o of own) event.relateException(o);

    if (!event.isRecurring()) {
      consider(event.startDate, event.endDate, event.summary ?? '');
      continue;
    }

    // Original (pre-override) times of moved occurrences: these must not be skipped as "past".
    const movedFrom = new Map<number, any>(own.map((o: any) => [toDate(o.getFirstPropertyValue('recurrence-id'), timeZone).getTime(), o]));
    const durationMs = toDate(event.endDate ?? event.startDate, timeZone).getTime() - toDate(event.startDate, timeZone).getTime();
    const it = event.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_ITERATIONS; i++, next = it.next()) {
      const original = toDate(next, timeZone).getTime();
      if (original >= windowEnd.getTime()) break; // stop on the series time, not on a moved occurrence
      if (original + durationMs <= now.getTime() && !movedFrom.has(original)) continue; // cheap skip of the past
      const occ = event.getOccurrenceDetails(next);
      consider(occ.startDate, occ.endDate, occ.item.summary ?? '');
    }
    // Occurrences whose series time is after the window but which were moved into it.
    for (const [original, o] of movedFrom) {
      if (original < windowEnd.getTime()) continue;
      const moved = new ICAL.Event(o);
      consider(moved.startDate, moved.endDate, moved.summary ?? '');
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title)).slice(0, MAX_EVENTS);
}
