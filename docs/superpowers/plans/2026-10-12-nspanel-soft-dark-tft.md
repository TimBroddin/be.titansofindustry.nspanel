# NSPanel Soft dark TFT, moods and calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> Deviation: this plan specifies interfaces and test cases; implementation code is written during TDD rather than inline (user pre-approved the whole flow).

**Goal:** Soft dark TFT with home / moods / climate / calendar pages, driven by our firmware and the Homey app.

**Architecture:** Page art as HTML/CSS → PNG (headless Chrome). The user builds the HMI in Nextion Editor from `tft/BUILD.md`. The firmware page table is updated. The app gets pure view functions per page, a calendar source, and an action runner.

**Tech Stack:** as foundation, plus `ical.js` 2.x and Google Chrome headless.

**Spec:** `docs/superpowers/specs/2026-10-12-nspanel-soft-dark-tft-design.md`

## Global Constraints

- Page ids: 0 boot, 1 home, 2 moods, 3 climate, 4 calendar, 5 notification, 6 screensaver.
- Colours (RGB565 for Nextion `pco`): text `#e9eef7` = 61310, muted `#9fb0cc` = 40345, amber `#f2b56b` = 62893.
- CSV from TFT: `page,action,arg`; the firmware maps it to `{type: 'touch', page, component: arg, action}` (field names per `UiEvent`).
- Tile state via `picc`; climate via globals `tgt/tmin/tmax/tstep` in tenths and `dsep`.
- Languages nl (default) and en; every on-screen label comes from `lib/i18n`.
- All PNGs exactly 480×320.

## Review Focus

- **Calendar across DST and all-day events:** an all-day event must not shift a day; recurring weekly events across 25 Oct 2026 (DST end) must keep local time. *Tests in Task 4.*
- **Tile tap while Homey refuses the action:** the tile must revert. *Test in Task 6.*
- **Target taps beyond min/max or with step 0.5:** must clamp and round. *Test in Task 6.*
- **Long event titles / quotes:** truncated to fit the row (max 28 chars, with `…`); quotes escaped by firmware. *Test in Task 5.*
- **No calendar configured / empty calendar:** home "Straks" card shows a localized "No events"; the calendar page shows the same in row 1. *Test in Task 5.*

---

### Task 1: Design pages as code, export PNGs
**Files:** `design/pages/{home,moods,moods-on,climate,calendar,notification,screensaver,boot}.html`, `design/style.css`, `design/export.ts`, `tft/assets/*.png`, `tests/design.test.ts`
- Backgrounds contain only static art: gradient, cards, borders, round buttons. No text and no icons, except the MDI glyph shapes of buttons drawn as images (home nav icons, ⌂, −, +).
- `moods-on.html` = the moods background with all 8 tiles in the amber state (crop source for "on").
- Test: every `tft/assets/*.png` is 480×320 (PNG IHDR read).

### Task 2: Component map and Editor build list
**Files:** `tft/COMPONENTS.md`, `tft/BUILD.md`
- COMPONENTS: per page, every component: name, type, x, y, w, h, font, pco, alignment, crop image, touch script. Generated from `design/layout.ts` (single source of coordinates, also used by the HTML pages), so the art and the components cannot drift apart.
- BUILD: ordered steps (import fonts → import pictures → per page: set background, add components, paste scripts) plus copy-paste script snippets (tile toggle, target +/−, 700 ms timer, idle timers, screensaver).

### Task 3: Firmware page table and clock
**Files:** `firmware/nspanel_ui.h`, `firmware/nspanel.yaml`
- `PAGE_NAMES` = 7 new pages. Clock writes `home.time.txt` + `screensaver.time.txt` (12 h: `%I:%M %p`). Remove relay chip and meridiem writes.
- Verify: `esphome config` + `esphome compile` succeed.

### Task 4: Calendar source
**Files:** `lib/sources/calendar.ts`, `tests/calendar.test.ts`, `tests/fixtures/*.ics`
- `parseUpcoming(ics: string, now: Date, days: number, timeZone: string): CalEvent[]` with `CalEvent { start: Date; end: Date; allDay: boolean; title: string }`, sorted, max 20.
- `fetchCalendar(url, fetchFn): Promise<string>` (`webcal://` → `https://`).
- Tests: single event; weekly RRULE expanded within window; EXDATE skipped; overridden instance (RECURRENCE-ID) uses the new time; all-day event stays on its date in Europe/Brussels; recurring 08:30 local stays 08:30 after 25 Oct 2026; events before `now` excluded, but ongoing ones included; `webcal://` converted.

### Task 5: Views
**Files:** `lib/panel/homeView.ts` (v2), `lib/panel/moodsView.ts`, `lib/panel/climateView.ts`, `lib/panel/calendarView.ts`, `lib/i18n/*.json`, tests per view
- `buildHomeProps(config, state)`: date, weather icon glyph + `13°` + `↑16° ↓8°`, chips string (active chip glyphs joined by two spaces), Binnen card (`21,5°`, `→ 20,0°`), Straks (`18:00` + title; second line next event `morgen 08:30 Tandarts`), labels from i18n. "No events" text when empty.
- `buildMoodsProps(config, tileStates: boolean[], lang)`: title, per tile `moods.iNN.txt` glyph, `moods.lNN.txt` label, `picc` on/off for both.
- `buildClimateProps(config, values, lang)`: labels, status line, info card; `climateCommands(...)` returns the `send_command` strings for tgt/tmin/tmax/tstep/dsep.
- `buildCalendarProps(events, now, lang, tz)`: 8 rows (`calendar.dNN.txt` day header or `calendar.tNN.txt` time + `calendar.eNN.txt` title), day header labels Vandaag/Morgen/`do 15 okt`, "hele dag", truncation with `…` at 28 chars.
- Tests cover nl and en strings, truncation, empty states, 8-row limit across multiple days.

### Task 6: Config, ActionRunner, target parsing
**Files:** `lib/config.ts`, `lib/actions/ActionRunner.ts`, tests
- Config: `moods` (8 slots: `{type: 'mood', moodId} | {type: 'flow', flowId, advanced} | {type: 'toggle', deviceId} | {type: 'trigger'}`, each + `icon`, `label`), `calendar`, `screen`; normalize + `watchedCapabilities` includes toggle tiles' `onoff`.
- `ActionRunner.handle(ev: UiEvent)`: `moods,tile,N` / `climate,target,N` as in the spec; returns `{ revertTile?: number }`. Fake API tests: each tile type calls the right method; a refusal returns a revert; target 205 → 20.5 clamped to min/max and rounded to the device step.

### Task 7: Device wiring, flow cards, settings and API
**Files:** `drivers/nspanel/device.ts`, `drivers/nspanel/driver.ts`, `.homeycompose/flow/**`, `api.ts`, `settings/index.html`
- Render all four pages through one renderer (diffed). Calendar refresh every 15 min plus the "Refresh calendar" action. Screen settings pushed on ready. New trigger "Tile pressed". API `GET /moods`, `GET /flows`, `POST /calendar/test`. Settings sections Moods / Calendar / Screen; Values section removed.
- Verify: `tsc`, lint, `bun test`, `homey app validate`.

### Task 8: Build the HMI (user, guided) and deploy
- The user follows `tft/BUILD.md` in Nextion Editor, compiles, and saves the TFT to `~/nspanel-tft/nspanel_soft_dark.tft`.
- Upload: Range server, Homey app disabled, `upload_tft` at 115200; then firmware OTA, app install, re-enable app.
- Verify on panel: pages match PNGs; tile tap flips instantly and runs the mood; +/− sets the thermostat; calendar shows real events; screensaver after N min.
