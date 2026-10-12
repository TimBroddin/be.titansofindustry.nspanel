# Phase 0 findings and foundation verification (2026-10-12)

## Current panel (before migration)
- Device name: `nspanelkeuken`, IP 192.168.1.152 (Mac Studio on 192.168.1.80, Homey Pro van Tim on 192.168.1.188)
- Old firmware: Blackymas package (ref `main`), **no API encryption**, OTA password = Wi-Fi password (Blackymas default)
- Old TFT: Blackymas **4.3.16**, which uses the legacy boot protocol (`current_page`/`display_mode`/`charset`/`boot.version` variables), not `localevent` CSV
- Old ESPHome YAML available: yes. OTA password known: yes (values in firmware/secrets.yaml, gitignored)

## Nextion Editor on macOS
- CrossOver 26.3.0, bottle win10_64, macOS 27.0 on M2 Ultra
- Nextion Editor **does not start**: wine-mono 10.4.1 asserts while loading `ApplicationRUN.s0`
  (`mono-error.c:647 error_code != MONO_ERROR_CLEANUP_CALLED_SENTINEL`)
- Next step: install Microsoft .NET Framework 4.8 into the bottle (CrossOver → Install a Windows Application);
  fallback .NET 4.7.2 in a fresh bottle, then a Windows 11 ARM VM (UTM)
- Not blocking for the foundation plan (stock TFT)

## Flashing
- Firmware OTA: OK (first `esphome upload` failed only because the build directory for the new name was empty; compile first)
- TFT upload of stock `v2026041`, 3 attempts:
  1. 921600 baud: upload prep failed (display answered garbage). Use 115200 (`baud: 0`)
  2. `python3 -m http.server` does not support HTTP Range; ESPHome's uploader requires it. Use a Range-capable server
  3. ESP crashed at 87% with VERY_VERBOSE logging while Homey kept reconnecting during the blocking upload.
     Normal logging + Homey app disabled during upload → Nextion **resumed at 86%** and finished (~12 min total at 115200)
- Firmware additions made during flashing: `power_cycle_display` action + `Screen power` switch (GPIO4), `upload_tft(url, baud)`
- Homey app install needs `package-lock.json` (Homey Pro reports "Missing File" without it)

## Foundation verification (Task 12 checklist)
| # | Check | Result |
|---|---|---|
| 1 | Time, date (nl), weather, indoor temp on home | **Pass** (user): time/date/weather; indoor temp appears once the NTC publishes (25.7 °C, reads high, see below) |
| 2 | Config saved in settings shows on panel within 1 s | **Pass** (user) |
| 3 | Chip follows a light toggled in Homey within 1 s | **Pass** (user) |
| 4 | Language nl ↔ en changes date line | Pending (user) |
| 5 | Left button short = relay 1 + chip, long = flow trigger | Pending (user) |
| 6 | "Event only" mode stops relay toggle, still triggers flow | Pending (user) |
| 7 | Notification with quotes/backslash renders, returns home | Sent via flow card without error; visual confirmation pending |
| 8 | Panel power loss → full repaint after boot | Partly covered: repaint after ESP reboots (OTA, TFT upload) observed; power cut pending |
| 9 | App restart → panel repainted | **Pass** (remote): device available, page `home` within 15 s; visual confirmation pending |
| 10 | Wi-Fi off 1 min: relays work, reconnects | Pending (user) |

## Follow-ups found during verification
- Panel NTC reads ~2-3 °C high (sits next to the electronics); Blackymas had a temperature correction setting. Only shown when no thermostat is configured.
- Pairing stores an empty encryption key; the device then shows "Encryption key required" until the key is pasted in settings (works, but could be asked during pairing).
