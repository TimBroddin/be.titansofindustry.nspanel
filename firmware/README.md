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
