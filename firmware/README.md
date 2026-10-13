# NSPanel firmware (Homey)

Thin ESPHome firmware for the Sonoff NSPanel EU. Drives the Blackymas `nspanel_eu.tft` (tag v2026041).

## Build
    cp secrets.example.yaml secrets.yaml   # then fill in
    esphome compile nspanel.yaml

## Flash (OTA)
    esphome upload nspanel.yaml --device <panel-ip>

`ota_password` must match the firmware currently on the panel.

## TFT upload
Serve the file over HTTP from this Mac, then call the `upload_tft` action from Homey
(device → Maintenance flow card) or from `esphome` logs:

    cd ~/nspanel-tft && python3 -m http.server 8000
    # url: http://<mac-ip>:8000/nspanel_eu.tft

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
