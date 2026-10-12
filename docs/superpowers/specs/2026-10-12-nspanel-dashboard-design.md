# NSPanel Homey Dashboard — Design

Date: 2026-10-12
Status: Draft, awaiting review

## 1. Goal

Turn the Sonoff NSPanel (EU, 480×320 landscape) into a fast, fully Homey-configurable wall dashboard for our own household.

Success criteria:

- Device state changes appear on the panel in well under a second (no polling).
- Touches give immediate visual feedback on the panel itself.
- Everything shown on the dashboard is configured from the Homey app settings page; changing it never requires reflashing.
- Physical buttons and relays keep working when Homey is unreachable.
- Panel language is configurable (Dutch and English at launch).

Not a goal: publishing to the Homey App Store, supporting the US portrait panel, or staying compatible with Home Assistant.

## 2. Current state

- Homey app (TypeScript, SDK v3) connects to a panel running the unmodified Blackymas NSPanel_HA_Blueprint ESPHome firmware + TFT, impersonating Home Assistant.
- Home page chips and entity values are refreshed by polling every 60 s, each value via separate `component_text` calls.
- Button events are recovered via HA-event messages and log parsing.
- `lib/ESPHomeClient.ts` is unused. `drivers/nspanel/device.ts` is ~1,200 lines.
- Device store holds `nspanelConfig` (`chips[6]`, `entities[4]`), edited via `settings/index.html`.

## 3. Decisions

| Topic | Decision |
|---|---|
| Panel stack | Own ESPHome firmware + own TFT (option C) |
| TFT base | Fork Blackymas' open-source `.HMI`; keep its fonts and MDI icon glyphs |
| Nextion Editor | Run under CrossOver on macOS; Windows ARM VM (UTM/Parallels) as fallback |
| Architecture | Thin panel: firmware is a generic renderer; Homey app owns config, state, formatting and actions |
| Transport | ESPHome native API (encrypted), via a maintained fork of `esphome-native-api` |
| "Button controls" | The two physical buttons and their relays |
| Thermostat | One Homey device; show current/target, adjust target with +/−; no mode switching |
| Moods page | 8 mixed scene tiles: mood, flow, device toggle, or flow-trigger only |
| Calendar | Single shared iCloud calendar via public `webcal://` link |
| Language | Configurable; all panel text is pushed at runtime; `nl` and `en` at launch |

## 4. Panel pages

All text on the TFT, including page titles and fixed labels, is a runtime-settable field. The TFT contains no hard-coded language.

### Kept and adapted from Blackymas

- **home**: clock, localized date, weather icon + outdoor temperature, thermostat current + target, 6 chips (icon + value), 4 value fields (icon + label + value), one "next event" line (`18:00 · Zwemles`), bottom navigation to Moods / Climate / Calendar. Tapping the weather icon opens the forecast page; tapping the thermostat opens climate.
- **climate**: single thermostat; current temperature, target temperature, +/− buttons. The target number updates locally on each tap.
- **weather**: 5-day forecast (one of the Blackymas weather pages; the others are removed).
- **boot**, **screensaver** (clock), **notification**, **qrcode**, **settings** (brightness).

### New

- **moods**: 2×4 grid of 8 tiles. Each tile: icon, label, on/off color state.
- **calendar**: 7 fixed rows. Rows hold either a day header (`Vandaag`, `Morgen`, `do 15 okt`) or an event (`time · title`, or the localized "all day" label).

### Removed

`buttonpage01–04`, `entitypage01–04`, `light`, `cover`, `fan`, `alarm`, `media_player`, `keyb_num`, `utilities`, `confirm`, `weather02–05`.

### Component map

`tft/COMPONENTS.md` lists every page, its Nextion page id, and every runtime-settable component (`page.id`, type, purpose). Firmware and renderer are written against this file. It is the single contract between the TFT and the code.

## 5. Firmware interface (ESPHome)

Built on ESPHome's standard `nextion` display component. Blueprint YAML and HA-specific scripts are not carried over.

### Services (Homey → panel)

| Service | Args | Purpose |
|---|---|---|
| `set_texts` | `page: string`, `ids: string[]`, `values: string[]` | Bulk text update (home fields, chips, value fields, calendar rows, localized labels) |
| `set_tile` | `slot: int`, `icon: string`, `label: string`, `state: bool`, `color: int` | Update one mood tile |
| `set_thermostat` | `current: float`, `target: float`, `min: float`, `max: float`, `step: float` | Update climate page and home thermostat |
| `set_weather` | `icon: string`, `temp: string`, `forecast: string[]` | Home weather + forecast page (forecast encoded as `day|icon|max|min` strings) |
| `set_visibility` | `page: string`, `ids: string[]`, `visible: bool[]` | Show/hide components (conditional chips) |
| `notify` / `notify_clear` | heading, message, timeout | Notification page |
| `goto_page` | `page: string` | Navigate |
| `qrcode` | `heading`, `content` | QR page |
| `play_rtttl` | `tone` | Buzzer |
| `set_brightness` | `day: int`, `night: int` | Display brightness |
| `set_button_mode` | `left: string`, `right: string` (`relay` / `event`) | Physical button behavior |

The firmware caches the last value per component and repaints a page from cache when it is opened, so page switches do not wait on Homey.

### Events (panel → Homey)

A single ESPHome `event` entity. Payload `{type, page, slot, value}`:

| type | Fields | When |
|---|---|---|
| `tile_press` | `slot` | Mood tile tapped |
| `target_set` | `value` | Thermostat target changed; sent after ~700 ms without further taps |
| `hw_button` | `slot` = `left`/`right`, `value` = `short`/`long` | Physical button pressed |
| `page_changed` | `page` | Page opened; Homey may refresh volatile data |

### Local behavior

- Tile state flips immediately on touch (optimistic). Homey sends the authoritative state afterwards.
- Relays are switched locally when a button is in `relay` mode. The mode is stored in flash and survives reboots.
- Time comes from SNTP. The clock keeps running without Homey.

## 6. Homey app

### Modules

| Module | Responsibility |
|---|---|
| `lib/panel/PanelConnection.ts` | Native API connection, reconnect with backoff, service discovery, typed `call(service, args)`, `onEvent` stream |
| `lib/panel/PanelRenderer.ts` | Maps config + current state to service calls. Diffs against last-sent values, coalesces changes in a 50 ms window, does a full repaint on (re)connect |
| `lib/sources/CapabilitySource.ts` | Live subscriptions (`homey-api` `makeCapabilityInstance`) for all configured device/capability pairs. Re-subscribes when config changes |
| `lib/sources/WeatherSource.ts` | Open-Meteo current + 5-day forecast, every 30 min, Homey geolocation |
| `lib/sources/CalendarSource.ts` | Fetches ICS (`webcal://` → `https://`) every 15 min, expands recurrences (RRULE, EXDATE, overrides), returns the next N events in Homey's timezone |
| `lib/actions/ActionRunner.ts` | Handles panel events: mood activation, flow start (standard and advanced), `onoff` toggle, `target_temperature` write, flow triggers |
| `lib/i18n/` | `nl.json`, `en.json` panel strings, `Intl`-based date/weekday formatting |
| `lib/config.ts` | Versioned config schema, defaults, validation, migration from `nspanelConfig` |
| `drivers/nspanel/device.ts` | Wires the modules together (~150 lines) |

`lib/ESPHomeClient.ts` and the HA-event/log-parsing code are removed.

### Config schema (per panel, device store key `dashboardConfig`)

```ts
interface DashboardConfig {
  version: 1;
  general: {
    language: 'nl' | 'en';
    dateFormat: string;
    weatherEnabled: boolean;
    brightnessDay: number;   // 0-100
    brightnessNight: number; // 0-100
  };
  home: {
    thermostat: { deviceId: string } | null;
    chips: Array<{ deviceId: string; capability: string; icon: string; unit: string; onlyWhenActive: boolean } | null>; // length 6
    values: Array<{ deviceId: string; capability: string; icon: string; label: string } | null>;                       // length 4
  };
  moods: Array<
    | { type: 'mood'; moodId: string; icon: string; label: string }
    | { type: 'flow'; flowId: string; advanced: boolean; icon: string; label: string }
    | { type: 'toggle'; deviceId: string; icon: string; label: string }
    | { type: 'trigger'; icon: string; label: string }
    | null
  >; // length 8
  calendar: { url: string; daysAhead: number; showNextOnHome: boolean } | null;
  buttons: { left: 'relay' | 'event'; right: 'relay' | 'event' };
}
```

Migration: an existing `nspanelConfig` maps `chips[i]` → `home.chips[i]` (`onlyWhenActive: false`) and `entities[i]` → `home.values[i]`. Everything else gets defaults. The old key is left in place until the new config has been saved once.

### Value formatting

- Numbers: one decimal, or zero decimals when the capability's `decimals` is 0. Unit appended.
- Booleans: localized on/off, or the chip is hidden when `onlyWhenActive` is set and the value is false.
- Missing or unavailable devices: `--`.

### Flow cards

- Kept: show notification, clear notification, wake up, play sound, show QR code, go to page (new page list), physical button pressed (trigger), update weather (manual override).
- New: "Tile pressed" trigger (tile slot + label tokens), "Refresh calendar" action.
- Removed: update button, update home entity.

### Error handling

- Failed tile action: renderer reverts the tile state on the panel and shows a short notification toast with the localized error.
- Failed weather or calendar fetch: keep last good data. When data is older than 2× its refresh interval, append a `!` marker to the weather temperature or calendar header.
- Disconnected panel: renderer keeps state; a full repaint happens on reconnect. Device is marked unavailable in Homey.
- Configured device deleted in Homey: slot renders `--` and the settings page flags the slot.

## 7. Settings UI

App settings page with a panel selector and tabs:

1. **General**: language, date format, weather toggle, day/night brightness.
2. **Home**: thermostat picker (devices with `target_temperature`), 6 chips (device, capability, icon, unit, only-when-active), 4 value fields (device, capability, icon, label).
3. **Moods**: 8 slots with type, target picker (moods / flows / devices, searchable), icon, label. Drag to reorder.
4. **Calendar**: `webcal` URL, "Test" button showing the next 5 parsed events, days ahead, show next event on home.
5. **Buttons**: left/right mode (relay or event).

The icon picker is a searchable grid limited to glyphs present in the TFT icon font. Saving applies immediately via the renderer.

API (`api.ts`): `GET /devices`, `GET /moods`, `GET /flows`, `GET /config/:deviceId`, `PUT /config/:deviceId`, `POST /calendar/test`, `GET /icons`.

Connection settings (host, port, encryption key) remain device settings.

## 8. Repository layout

```
/                    Homey app (unchanged location)
/lib/...             modules from section 6
/firmware/           ESPHome YAML (+ secrets.yaml, gitignored)
/tft/                forked .HMI, compiled .tft, COMPONENTS.md
/tests/              bun tests + ICS fixtures
/docs/superpowers/   specs and plans
```

The project is put under git before any changes.

## 9. Testing

- `bun test` unit tests for: config migration and validation, renderer diffing and coalescing, calendar parsing (recurring, all-day, multi-day, DST changes, timezone conversion) against ICS fixtures, i18n date formatting, ActionRunner against a fake Homey API.
- PanelConnection tested against a minimal fake ESPHome native API server for reconnect and event decoding.
- Firmware: `esphome config` and `esphome compile` must pass.
- Per-phase manual checklist on the real panel: touch feedback, state-change latency, page-switch speed, reconnect after Wi-Fi drop and after Homey app restart, relays with Homey offline.

## 10. Flashing and rollback

- Before anything changes, back up the current firmware binary and record the installed TFT version.
- New firmware is installed via OTA (the panel already runs ESPHome).
- TFT is uploaded via ESPHome `upload_tft` from a local HTTP URL.
- Rollback: OTA back to the Blackymas firmware and re-upload its TFT.

## 11. Phases

Each phase ends with a working panel.

0. **Toolchain spike**: `git init`; Nextion Editor under CrossOver compiles the stock Blackymas `.HMI`; ESPHome builds a minimal NSPanel config; firmware backup taken.
1. **Firmware + TFT skeleton**: trimmed page set, runtime-settable labels, component map, all services and the event entity; home page driven by a test script.
2. **App core**: PanelConnection, PanelRenderer, CapabilitySource, config + migration, i18n basics. Home page is live and polling is gone.
3. **Moods**: moods page, ActionRunner, "Tile pressed" trigger.
4. **Climate and weather**: thermostat control, forecast page.
5. **Calendar**: CalendarSource, calendar page, next-event line on home.
6. **Settings UI and polish**: tabbed settings, icon picker, calendar test, error-state polish.

## 12. Risks

- **Nextion Editor under CrossOver on current macOS** may not compile or upload. Mitigation: phase 0 checks this first; VM fallback.
- **`esphome-native-api` forks** may lag behind current ESPHome protocol versions, for example the event entity or list arguments for services. Mitigation: phase 0/1 verifies event entity and array arguments end to end; fallback is to encode arrays as delimited strings and use a text sensor for events.
- **Homey API scopes**: starting flows and activating moods need the appropriate app permissions (`homey:manager:api`). Verify in phase 2.
- **TFT editing is manual GUI work** that only the user can do. Mitigation: keep TFT pages generic, and give exact step-by-step edit lists per page.
