# NSPanel Soft dark TFT, moods and calendar — Design

Date: 2026-10-12
Status: Approved by user ("everything is approved")
Builds on: `2026-10-12-nspanel-dashboard-design.md` (§13 and §14 especially) and the `foundation` branch.

## 1. Goal

Replace the stock Blackymas screens with our own **Soft dark** TFT, and add the moods and calendar features, so the panel:

- looks modern and calm (dark navy gradient, translucent cards, amber accent),
- has four main pages (home, moods, climate, calendar) plus notification, screensaver and boot,
- reacts instantly to touches (feedback is drawn by the display itself),
- stays fully configurable and language-switchable from Homey.

Visual reference: `docs/design/2026-10-12-visual-style-options.html` (option A) and the approved page set (§3).

## 2. Decisions

| Topic | Decision |
|---|---|
| Visual style | Soft dark: radial navy gradient `#23314d → #121826 → #0b0f18`, cards `rgba(255,255,255,.06)` + 1 px `rgba(255,255,255,.09)` border, radius 18 px; text `#e9eef7`, muted `#9fb0cc`, accent amber `#f2b56b` |
| Build approach | Page backgrounds and "on" states are pre-rendered images. Text and icons are Nextion Text components with crop images on top. A new HMI keeps only Blackymas' plumbing: boot page and handshake, `localevent` protocol, `Program.s` and the MDI icon fonts |
| Design source | HTML/CSS in `design/pages/`, exported pixel-exact to PNG with headless Chrome (`design/export.ts`). The design is code: diffable and re-exportable. This replaces Pencil from spec §14 |
| Text font | Inter, generated in Nextion Editor at a small fixed set of sizes (§6) |
| Home value fields | **Dropped.** Home shows only chips (status icons). Numeric values stay in the Homey app |
| Relay chips | Dropped from the TFT. Relay state is visible on the lights themselves and in Homey |
| Forecast, QR, settings pages | Not in this TFT |
| Touch feedback | Done in Nextion script: tiles flip on touch, the climate target updates locally, and the target is sent 700 ms after the last tap |
| Calendar | Single public `webcal://` iCloud calendar, parsed with `ical.js` (recurrence, exceptions, time zones) |

## 3. Pages

Page ids (Nextion index): `0 boot`, `1 home`, `2 moods`, `3 climate`, `4 calendar`, `5 notification`, `6 screensaver`.

- **home**: clock (firmware, SNTP), date, weather icon + outdoor temperature + high/low, up to 7 chips (one text field of glyphs, amber, top right), *Binnen* card (current temperature, `→ target`), *Straks* card (next event: time in amber + title, and a second line). Round nav buttons Moods / Climate / Calendar. Tapping the Binnen card opens climate; tapping Straks opens calendar.
- **moods**: title, home button, 8 tiles (2×4). Each tile = icon + label, off or on (amber) state.
- **climate**: title, home button, "target" label, big target `20,0°`, `−` and `+` round buttons, status line (`● Verwarmen · nu 21,5°`), info card (room name, thermostat name, outside temperature).
- **calendar**: title, home button, 8 rows. Each row is a day header (muted caps) or an event (time in amber, or "hele dag" muted, + title).
- **notification**: heading, text (word-wrapped), close button → previous page.
- **screensaver**: dimmed clock + date on plain gradient; any touch → home.
- **boot**: Blackymas boot page with handshake logic, restyled to the dark background.

Idle behaviour (Nextion timers): moods, climate and calendar return to home after 60 s without touch. Home goes to the screensaver after `ss_min` minutes (set by Homey, 0 = never). The screensaver sets `dim=ss_dim`, and leaving it restores `dim=brightness`.

## 4. Touch protocol (TFT → firmware → Homey)

Unchanged transport: the TFT writes CSV `page,action,arg` into `localevent` and the firmware forwards it as event `esphome.nspanel_ui` `{type: touch, page, slot: arg, value: action}`.

| CSV | Meaning |
|---|---|
| `home,nav,moods` / `home,nav,climate` / `home,nav,calendar` | Navigation (page change happens in the TFT; informational) |
| `moods,tile,3` | Tile 3 (1-based) tapped; the TFT already flipped it |
| `climate,target,205` | New target in tenths (20.5°), sent 700 ms after the last tap |
| `notification,close,` | Close tapped |

Page changes also arrive as `type: page` events (firmware `on_page`).

## 5. Homey → TFT properties

All through the existing `set_props` (`page.component.attr`). Text uses `txt`, visibility uses `vis`, and the tile state uses `picc` (crop image id): `PIC_MOODS_OFF` or `PIC_MOODS_ON`, for both the icon and the label component of a tile. Climate uses global integer variables, set with `send_command`: `climate.tgt.val`, `climate.tmin.val`, `climate.tmax.val`, `climate.tstep.val` (tenths), and `climate.dsep.txt` (decimal separator). Global screen settings use `send_command`: `brightness=`, `ss_min=`, `ss_dim=`.

The exact component list (names, positions, sizes, fonts, colours, crop images) lives in `tft/COMPONENTS.md`. The firmware and app are written against it.

## 6. Fonts

Generated in Nextion Editor (Tools → Font Generator, anti-aliased, ISO-8859-1 unless noted):

| Id (planned) | Font | Size (px) | Characters | Use |
|---|---|---|---|---|
| F_CLOCK | Inter ExtraLight | 80 | `0123456789:` | home clock |
| F_HUGE | Inter ExtraLight | 84 | `0123456789,.°-` | climate target |
| F_BIG | Inter Light | 32 | Latin-1 | temperatures |
| F_BODY | Inter Regular | 17 | Latin-1 | event titles, tile labels, body |
| F_SMALL | Inter Regular | 13 | Latin-1 | secondary lines, captions |
| F_TITLE | Inter Medium | 22 | Latin-1 | page titles |
| F_ICON_S / F_ICON_L | MDI (from Blackymas HMI) | ≈24 / ≈32 | as provided | chips, nav, tiles, weather |

Small caps labels ("BINNEN") reuse F_SMALL in upper case. The final ids are recorded in `tft/COMPONENTS.md` once generated.

## 7. Homey app changes

- **Config** (`dashboardConfig`, still `version: 1`, normalize adds defaults): `moods: Array<Tile | null>` (8); `calendar: { url, daysAhead } | null`; `screen: { screensaverMinutes, screensaverBrightness }`. Home `values` stay in the schema for backwards compatibility but are no longer rendered.
- **Views** (pure, unit-tested): `homeView` (v2 layout), `moodsView`, `climateView`, `calendarView`. Each returns a `Record<key, value>` for the renderer.
- **Sources**: `CalendarSource` fetches the ICS every 15 min and expands the next `daysAhead` days in Homey's timezone. Weather adds today's high/low (`daily=temperature_2m_max,temperature_2m_min`).
- **ActionRunner**: `moods,tile,N` → mood `setMood`, flow `triggerFlow` / `triggerAdvancedFlow`, toggle `onoff`, or "trigger only". It always fires the "Tile pressed" flow trigger. If Homey refuses (missing scope), the error is logged and the tile is reverted, and the trigger card remains the documented fallback. `climate,target,N` → `target_temperature` = N/10, clamped to the device's min/max.
- **Flow cards**: new trigger "Tile pressed" (tokens: tile number, label); new action "Refresh calendar"; `goto_page` values become home / moods / climate / calendar.
- **Settings page**: new sections for Moods (8 slots: type, target picker, icon, label), Calendar (URL, days ahead, *Test* button showing parsed events), Screen (screensaver minutes, brightness). The Values section is removed.
- **API**: `GET /moods`, `GET /flows`, `POST /calendar/test`.

## 8. Firmware changes

- `PAGE_NAMES` = the 7 new pages.
- Clock writes `home.time.txt` and `screensaver.time.txt`; 12 h format `%I:%M %p` in one field (meridiem component dropped).
- Relay chip writes removed.
- Boot handshake unchanged (`boot,params,…` from the kept boot page).

## 9. Error handling

- A tile action that fails → the app sets the tile back to its real state (`picc`), and the notification page shows a short localized error.
- Calendar fetch failure → keep last good events. When older than 2 × 15 min, the calendar title gets a `!`.
- Unknown CSV actions are ignored with a log line.

## 10. Testing

- `bun test` for every pure module: views (with i18n nl/en), config normalization of new sections, calendar expansion (recurring weekly, EXDATE, all-day, multi-day, DST change, Europe/Brussels), ActionRunner (fake Homey API: mood/flow/toggle/trigger-only, refusal → revert), target parsing and clamping.
- Design export: a test that every exported PNG is exactly 480×320.
- Manual on panel: each page renders like its PNG, touch feedback is immediate, tile/target round trip, calendar shows real events, screensaver.

## 11. Delivery steps

1. Design pages as HTML, export PNGs.
2. Write `tft/COMPONENTS.md` and `tft/BUILD.md` (step-by-step Editor build list).
3. Firmware + app changes (TDD).
4. User builds the HMI in Nextion Editor following `tft/BUILD.md`. The agent supports by reading back exported HMI code or screenshots.
5. Compile, upload TFT (115200, Range server, app disabled during upload), flash firmware, install app, verify.
