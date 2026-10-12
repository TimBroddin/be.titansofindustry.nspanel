import { describe, expect, test } from 'bun:test';
import { fetchCalendar, parseUpcoming } from '../lib/sources/calendar';

const TZ = 'Europe/Brussels';
const NOW = new Date('2026-10-12T08:00:00Z'); // Monday 10:00 in Brussels

const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Brussels
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
DTSTART:19810329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZNAME:CEST
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
DTSTART:19961027T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZNAME:CET
END:STANDARD
END:VTIMEZONE`;

const cal = (...events: string[]): string => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', VTIMEZONE, ...events, 'END:VCALENDAR'].join('\r\n');

const ev = (uid: string, lines: string[]): string => ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260101T000000Z', ...lines, 'END:VEVENT'].join('\r\n');

const iso = (d: Date): string => d.toISOString();

describe('parseUpcoming', () => {
  test('single timed event in a VTIMEZONE', () => {
    const out = parseUpcoming(cal(ev('a', ['DTSTART;TZID=Europe/Brussels:20261012T180000', 'DTEND;TZID=Europe/Brussels:20261012T190000', 'SUMMARY:Zwemles'])), NOW, 7, TZ);
    expect(out).toEqual([{ start: new Date('2026-10-12T16:00:00Z'), end: new Date('2026-10-12T17:00:00Z'), allDay: false, title: 'Zwemles' }]);
  });

  test('weekly recurrence keeps local time across the DST change (25 Oct 2026)', () => {
    const out = parseUpcoming(cal(ev('b', [
      'DTSTART;TZID=Europe/Brussels:20260901T083000', 'DTEND;TZID=Europe/Brussels:20260901T090000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU', 'SUMMARY:Tandarts',
    ])), NOW, 16, TZ);
    expect(out.map((e) => iso(e.start))).toEqual(['2026-10-13T06:30:00.000Z', '2026-10-20T06:30:00.000Z', '2026-10-27T07:30:00.000Z']);
  });

  test('EXDATE removes an occurrence and RECURRENCE-ID moves one', () => {
    const out = parseUpcoming(cal(
      ev('c', ['DTSTART;TZID=Europe/Brussels:20260901T190000', 'DTEND;TZID=Europe/Brussels:20260901T200000',
        'RRULE:FREQ=DAILY', 'EXDATE;TZID=Europe/Brussels:20261013T190000', 'SUMMARY:Yoga']),
      ev('c', ['RECURRENCE-ID;TZID=Europe/Brussels:20261014T190000', 'DTSTART;TZID=Europe/Brussels:20261014T210000',
        'DTEND;TZID=Europe/Brussels:20261014T220000', 'SUMMARY:Yoga (later)']),
    ), NOW, 3, TZ);
    expect(out.map((e) => [iso(e.start), e.title])).toEqual([
      ['2026-10-12T17:00:00.000Z', 'Yoga'],
      ['2026-10-14T19:00:00.000Z', 'Yoga (later)'],
    ]);
  });

  test('all-day and multi-day events start at local midnight and include ongoing ones', () => {
    const out = parseUpcoming(cal(
      ev('d', ['DTSTART;VALUE=DATE:20261014', 'DTEND;VALUE=DATE:20261015', 'SUMMARY:Oma jarig']),
      ev('e', ['DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261016', 'SUMMARY:Herfstvakantie']),
    ), NOW, 7, TZ);
    expect(out).toEqual([
      { start: new Date('2026-10-09T22:00:00Z'), end: new Date('2026-10-15T22:00:00Z'), allDay: true, title: 'Herfstvakantie' },
      { start: new Date('2026-10-13T22:00:00Z'), end: new Date('2026-10-14T22:00:00Z'), allDay: true, title: 'Oma jarig' },
    ]);
  });

  test('past events are dropped, events in progress are kept, window end is respected', () => {
    const out = parseUpcoming(cal(
      ev('f', ['DTSTART;TZID=Europe/Brussels:20261012T070000', 'DTEND;TZID=Europe/Brussels:20261012T080000', 'SUMMARY:Ontbijt']),
      ev('g', ['DTSTART;TZID=Europe/Brussels:20261012T090000', 'DTEND;TZID=Europe/Brussels:20261012T110000', 'SUMMARY:Vergadering']),
      ev('h', ['DTSTART;TZID=Europe/Brussels:20261030T090000', 'DTEND;TZID=Europe/Brussels:20261030T100000', 'SUMMARY:Te ver']),
    ), NOW, 7, TZ);
    expect(out.map((e) => e.title)).toEqual(['Vergadering']);
  });

  test('UTC and floating times', () => {
    const out = parseUpcoming(cal(
      ev('i', ['DTSTART:20261012T150000Z', 'DTEND:20261012T160000Z', 'SUMMARY:UTC']),
      ev('j', ['DTSTART:20261012T200000', 'DTEND:20261012T210000', 'SUMMARY:Floating']),
    ), NOW, 1, TZ);
    expect(out.map((e) => [iso(e.start), e.title])).toEqual([
      ['2026-10-12T15:00:00.000Z', 'UTC'],
      ['2026-10-12T18:00:00.000Z', 'Floating'],
    ]);
  });

  test('caps the result at 20 events', () => {
    const out = parseUpcoming(cal(ev('k', ['DTSTART;TZID=Europe/Brussels:20261012T120000', 'DURATION:PT10M', 'RRULE:FREQ=HOURLY', 'SUMMARY:Ping'])), NOW, 7, TZ);
    expect(out).toHaveLength(20);
  });
});

describe('fetchCalendar', () => {
  test('converts webcal:// to https:// and returns the body', async () => {
    let requested = '';
    const body = await fetchCalendar('webcal://p01-caldav.icloud.com/published/2/abc', async (url) => {
      requested = url;
      return { ok: true, status: 200, text: async () => 'BEGIN:VCALENDAR' };
    });
    expect(requested).toBe('https://p01-caldav.icloud.com/published/2/abc');
    expect(body).toBe('BEGIN:VCALENDAR');
  });

  test('throws on HTTP errors', async () => {
    await expect(fetchCalendar('https://x', async () => ({ ok: false, status: 404, text: async () => '' }))).rejects.toThrow('404');
  });
});
