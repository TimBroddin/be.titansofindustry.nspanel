# NSPanel firmware (Homey)

Thin ESPHome firmware for the Sonoff NSPanel EU. Drives the Soft dark TFT in `tft/nextion/` (the Blackymas `nspanel_eu.tft`, tag v2026041, works too).

## Build
    cp secrets.example.yaml secrets.yaml   # then fill in
    esphome compile nspanel.yaml

## Flash (OTA)
    esphome upload nspanel.yaml --device <panel-ip>

`ota_password` must match the firmware currently on the panel.

## TFT upload
Disable the Homey app first (and wait 60 s after an OTA), then from the repo root:

    bun scripts/upload-tft.ts --panel <panel-ip>   # serves tft/nextion/nspanel_soft_dark.tft with Range support

## Rollback to Blackymas
Rebuild the Blackymas firmware from their repo using your old YAML, then
`esphome upload <old>.yaml --device <panel-ip>`. The TFT stays compatible.

## TFT upload: lessons learned
- Use 115200 baud (`baud: 0`); 921600 fails on this panel.
- The HTTP server must support Range requests (`python3 -m http.server` does not). A tiny Bun server with `Bun.file().slice()` works.
- Pause the Homey app during the upload (the ESP's main loop is blocked for ~12 minutes; reconnect attempts plus verbose logging crashed it once).
- **Before retrying a failed upload, reboot the ESP** (OTA the same firmware). ESPHome keeps an internal "first chunk sent" flag from the failed attempt, and the retry then fails with `Invalid range end ... size: 0`. After the reboot, call `power_cycle_display` and then `upload_tft`. The display resumes where it stopped.
- **After an OTA, wait at least 60 s before starting a TFT upload.** Safe mode only marks a new firmware as good after 60 s
  of uptime. The upload blocks the ESP and reboots it when done; if that reboot comes first, the bootloader rolls back to the
  previous firmware (log: `OTA rollback detected! Rolled back from partition ...`).
