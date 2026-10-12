# NSPanel Foundation (Phases 0–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Blackymas HA-blueprint firmware with our own thin ESPHome firmware, and rebuild the Homey app core so the home page is driven by live capability subscriptions instead of 60-second polling.

**Architecture:** The panel keeps the **stock Blackymas EU TFT** for now. TFT forking starts in the next plan. Our firmware turns into a generic renderer: one `set_props` action writes Nextion component properties, a per-page cache replays them when a page opens, and touch, page and button events reach Homey as `esphome.nspanel_ui` events. The Homey app owns everything else. It loads config, subscribes to device capabilities with `homey-api`, builds the home-page property map with a pure function, and a renderer diffs and batches it to the panel.

**Tech Stack:** ESPHome 2026.6 (esp-idf, `nextion` display); Homey Apps SDK v3, TypeScript (tsc → `.homeybuild`); `@2colors/esphome-native-api` 1.3.x; `homey-api` 3.x; Open-Meteo; `bun test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-12-nspanel-dashboard-design.md`

## Global Constraints

- Panel: Sonoff NSPanel **EU**, 480×320 landscape, stock TFT `nspanel_eu.tft` from Blackymas tag `v2026041`.
- Pins: Nextion UART TX 16 / RX 17 @ 115200; left button GPIO14 (inverted); right button GPIO27 (inverted); relay 1 GPIO22; relay 2 GPIO19; buzzer GPIO21 (LEDC); NTC ADC GPIO38 (11.2 kΩ downstream, B 3950, 10 kΩ @ 25 °C).
- Panel → Homey events use the HA event name `esphome.nspanel_ui` with data keys `type`, `page`, `slot`, `value`.
- Property keys use the format `<page>.<component>.<attr>`. `attr == "txt"` is sent quoted, `attr == "vis"` becomes `vis <component>,<0|1>`, and any other attr is sent raw (`<component>.<attr>=<value>`).
- Languages: `nl` (default) and `en`. Date formats keep the existing device setting ids: `ddd DD MMM`, `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `DD MMM YYYY`.
- Icons are MDI glyph **characters** from Blackymas' `all_icons` map (e.g. lightbulb = U+E334). Never escaped `\uXXXX` text.
- Home slots: 7 chips (`chip01`–`chip07`, icon-only indicators), 4 values (`value01`–`value04` + `_icon`).
- Pure modules under `lib/` must not import `homey`, so `bun test` can run them.
- Homey timers go through `this.homey.setTimeout/setInterval`.
- Use `bun` for tooling (`bun install`, `bun test`, `bunx`). The Homey CLI runs via `bunx homey`.

## Review Focus

- **Panel reboots while Homey stays connected:** the firmware cache is empty after a reboot, so the app must do a full repaint on every `ready`, not only on first connect. *Pinned by the Task 7 test "reset() makes the next update resend everything".*
- **Configured device was deleted or is unreachable:** watching it throws. The slot must render `--` and other slots must keep working; a later `watch()` must retry. *Pinned by Task 9 tests.*
- **Legacy icons stored as escaped text (`"\\uE335"`)** by the old settings page must be decoded into real glyphs on migration. Otherwise the panel prints `\uE335` literally. *Pinned by the Task 3 test "decodes escaped icon text".*
- **Text containing quotes or backslashes** (device names, labels) must not break the Nextion command. *Handled by `escape_txt` in firmware (Task 2) and checked on the manual checklist (Task 12).*
- **Date at local midnight / DST:** the date line must use Homey's timezone, not UTC. *Pinned by the Task 4 test for 23:30 UTC → next day in Europe/Brussels.*

---

## File Structure

```
firmware/
  nspanel.yaml             ESPHome config: hardware, actions, event bridge
  nspanel_ui.h             Page table, CSV split, Nextion command builder, PropCache
  secrets.example.yaml     Template for secrets.yaml (gitignored)
  README.md                Build/flash/rollback instructions
lib/
  config.ts                DashboardConfig schema, normalize, legacy migration, watched capabilities
  icons.json               name → glyph map generated from Blackymas all_icons
  i18n/index.ts            Lang, t(), formatDate, formatNumber, formatValue, isActive
  i18n/en.json, nl.json    Panel strings
  weather.ts               Open-Meteo fetch + WMO code → TFT weather picture id
  panel/homeView.ts        buildHomeProps(config, state) → Record<key, value>
  panel/PanelRenderer.ts   Diffing, batching, coalescing sender
  panel/serviceArgs.ts     ESPHome user-action argument typing
  panel/uiEvents.ts        Parse esphome.nspanel_ui events
  panel/PanelConnection.ts Native API client wrapper (@2colors/esphome-native-api)
  sources/CapabilitySource.ts  Live capability subscriptions
scripts/extract-icons.ts   Generates lib/icons.json from a Blackymas checkout
tests/                     bun tests mirroring lib/
drivers/nspanel/device.ts  Wiring only
drivers/nspanel/driver.ts  Flow card registration
api.ts                     Settings page API
settings/index.html        Settings page (rewritten, compact)
```

Removed: `lib/ESPHomeClient.ts`, `scripts/patch-esphome-api.js`, the `esphome-native-api` dependency, flow cards `update_button`, `update_home_entity`, `update_weather`, `show_qrcode`, `button_pressed`, and capabilities `nspanel_version_blueprint` and `nspanel_brightness`.

---

### Task 1: Phase 0 — toolchain spike and rollback prep (manual, with the user)

This task produces no code. It answers two risk questions from the spec and gathers what we need to flash safely. **The user does the GUI parts.** The agent guides them and records the results.

**Files:**
- Create: `docs/phase0-findings.md`

- [ ] **Step 1: Record the current panel state**

In the Homey app, open the NSPanel device and note:
- `host` and `encryptionKey` from device settings
- the TFT, ESPHome and Blueprint version capabilities

Then ask the user whether they still have the ESPHome YAML from the old Home Assistant setup. We need its Wi-Fi credentials, its `api` encryption key and its **OTA password** (if one is set). Without the OTA password, flashing over the air will be rejected, and the fallback is a serial flash (opening the panel, 3.3 V USB-TTL on the header).

- [ ] **Step 2: Nextion Editor under CrossOver**

The user installs the CrossOver trial (codeweavers.com) and installs Nextion Editor into a new Windows 10 64-bit bottle. Use the Editor version named in Blackymas' `hmi/README` or the latest 1.65.x. Download `hmi/nspanel_eu.HMI` from tag `v2026041`:

```bash
mkdir -p ~/nspanel-tft && cd ~/nspanel-tft
curl -L -o nspanel_eu.HMI https://github.com/Blackymas/NSPanel_HA_Blueprint/raw/v2026041/hmi/nspanel_eu.HMI
curl -L -o nspanel_eu.tft https://github.com/Blackymas/NSPanel_HA_Blueprint/raw/v2026041/hmi/nspanel_eu.tft
```

The user opens the HMI in the Editor and runs **File → TFT file output**. Expected: a `.tft` within ±5 % of the 7,612,860-byte stock file, with no compile errors.

If CrossOver fails, record the error and fall back to a Windows 11 ARM VM in UTM. This doesn't block the rest of this plan, which uses the stock TFT.

- [ ] **Step 3: Write findings**

Create `docs/phase0-findings.md` with exactly these headings, filled in:

```markdown
# Phase 0 findings (2026-10-12)

## Current panel
- Host: <ip>
- TFT / ESPHome / Blueprint versions: <...>
- Old ESPHome YAML available: yes/no
- OTA password known: yes/no (value stays in firmware/secrets.yaml, not here)

## Nextion Editor on macOS
- CrossOver version: <...>, Nextion Editor version: <...>
- Stock HMI compiles: yes/no (output size: <bytes>)
- Notes / fallback used: <...>
```

- [ ] **Step 4: Commit**

```bash
git add docs/phase0-findings.md
git commit -m "docs: phase 0 toolchain and panel findings"
```

---

### Task 2: Firmware

**Files:**
- Create: `firmware/nspanel.yaml`, `firmware/nspanel_ui.h`, `firmware/secrets.example.yaml`, `firmware/README.md`
- Modify: `.gitignore` (already ignores `/firmware/secrets.yaml` and `/firmware/.esphome/`)

**Interfaces:**
- Produces (ESPHome user actions, the contract consumed by Tasks 8 and 10):
  - `set_props(keys: string[], values: string[])`
  - `goto_page(page: string)`
  - `send_command(cmd: string)`
  - `set_brightness(brightness: int)` (0–100)
  - `set_clock_format(h24: bool)`
  - `set_button_mode(button: string /* "left"|"right" */, relay: bool)`
  - `play_rtttl(tone: string)`
  - `upload_tft(url: string)`
- Produces (HA event `esphome.nspanel_ui`, data `{type, page, slot, value}`):
  - `type=touch`: `page`=TFT page, `slot`=component name, `value`=`short_click`|`long_click`
  - `type=page`: `page`=page name, other fields empty
  - `type=hw_button`: `slot`=`left`|`right`, `value`=`short`|`long`
- Produces (entities): sensors `Temperature`, `RSSI`; text sensors `Version TFT`, `Version ESPHome`, `Current page`; switches `Relay 1`, `Relay 2`; binary sensors `Left Button`, `Right Button`.

- [ ] **Step 1: Write `firmware/nspanel_ui.h`**

```cpp
#pragma once
// Helpers for the NSPanel Homey firmware: page table, property cache, CSV parsing.
#include "esphome.h"
#include <map>
#include <string>
#include <vector>

namespace nspanel_ui {

static const char *const TAG = "nspanel_ui";

// Page ids of the Blackymas EU TFT (index == Nextion page id).
static const char *const PAGE_NAMES[] = {
    "boot",         "home",         "weather01",    "weather02",    "weather03",    "weather04",    "weather05",
    "climate",      "settings",     "screensaver",  "light",        "cover",        "buttonpage01", "buttonpage02",
    "buttonpage03", "buttonpage04", "notification", "qrcode",       "entitypage01", "entitypage02", "entitypage03",
    "entitypage04", "fan",          "alarm",        "keyb_num",     "media_player", "confirm",      "utilities"};
static const int PAGE_COUNT = sizeof(PAGE_NAMES) / sizeof(PAGE_NAMES[0]);

inline std::string page_name(int id) { return (id >= 0 && id < PAGE_COUNT) ? PAGE_NAMES[id] : "unknown"; }

inline std::vector<std::string> split_csv(const std::string &s) {
  std::vector<std::string> out;
  size_t start = 0, pos;
  while ((pos = s.find(',', start)) != std::string::npos) {
    out.push_back(s.substr(start, pos - start));
    start = pos + 1;
  }
  out.push_back(s.substr(start));
  return out;
}

inline std::string escape_txt(const std::string &v) {
  std::string o;
  for (char c : v) {
    if (c == '"' || c == '\\') o += '\\';
    o += c;
  }
  return o;
}

// Key format: "<page>.<component>.<attr>", e.g. "home.time.txt", "home.chip01.vis", "home.weather.pic".
inline std::string build_command(const std::string &component, const std::string &attr, const std::string &value) {
  if (attr == "vis") return "vis " + component + "," + (value == "1" ? "1" : "0");
  if (attr == "txt") return component + ".txt=\"" + escape_txt(value) + "\"";
  return component + "." + attr + "=" + value;
}

// Remembers the last value per page/component/attr. Values for the visible page are sent
// immediately; values for other pages are replayed when that page opens (Blackymas
// components are local-scope and reset on page change).
class PropCache {
 public:
  void set(esphome::nextion::Nextion *disp, const std::string &key, const std::string &value) {
    size_t a = key.find('.');
    size_t b = key.rfind('.');
    if (a == std::string::npos || a == b) {
      ESP_LOGW(TAG, "Bad key '%s'", key.c_str());
      return;
    }
    std::string page = key.substr(0, a);
    std::string comp_attr = key.substr(a + 1);
    auto &props = by_page_[page];
    auto it = props.find(comp_attr);
    if (it != props.end() && it->second == value) return;
    props[comp_attr] = value;
    if (page_name(current_page_) == page) send_(disp, comp_attr, value);
  }

  void on_page(esphome::nextion::Nextion *disp, int page_id) {
    current_page_ = page_id;
    auto it = by_page_.find(page_name(page_id));
    if (it == by_page_.end()) return;
    for (auto &kv : it->second) send_(disp, kv.first, kv.second);
  }

 private:
  void send_(esphome::nextion::Nextion *disp, const std::string &comp_attr, const std::string &value) {
    size_t d = comp_attr.rfind('.');
    disp->send_command(build_command(comp_attr.substr(0, d), comp_attr.substr(d + 1), value).c_str());
  }
  std::map<std::string, std::map<std::string, std::string>> by_page_;
  int current_page_ = 0;
};

inline PropCache &cache() {
  static PropCache c;
  return c;
}

}  // namespace nspanel_ui
```

- [ ] **Step 2: Write `firmware/nspanel.yaml`**

```yaml
substitutions:
  name: nspanel
  friendly_name: NSPanel
  icon_relay_on: "\uE334"  # mdi:lightbulb

esphome:
  name: ${name}
  friendly_name: ${friendly_name}
  includes:
    - nspanel_ui.h
  on_boot:
    priority: -100
    then:
      - lambda: id(disp1).send_command("brightness=100");

esp32:
  board: esp32dev
  framework:
    type: esp-idf

logger:
  baud_rate: 0

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: ${name}-fallback

captive_portal:

api:
  encryption:
    key: !secret api_encryption_key
  on_client_connected:
    - lambda: id(disp1).send_command("api=1");
  on_client_disconnected:
    - lambda: id(disp1).send_command("api=0");
  actions:
    - action: set_props
      variables:
        keys: string[]
        values: string[]
      then:
        - lambda: |-
            if (keys.size() != values.size()) {
              ESP_LOGW("nspanel_ui", "set_props: %u keys vs %u values", keys.size(), values.size());
              return;
            }
            for (size_t i = 0; i < keys.size(); i++) nspanel_ui::cache().set(id(disp1), keys[i], values[i]);
    - action: goto_page
      variables:
        page: string
      then:
        - lambda: id(disp1).send_command(("page " + page).c_str());
    - action: send_command
      variables:
        cmd: string
      then:
        - lambda: id(disp1).send_command(cmd.c_str());
    - action: set_brightness
      variables:
        brightness: int
      then:
        - lambda: |-
            int b = std::max(0, std::min(100, (int) brightness));
            id(disp1).send_command_printf("brightness=%d", b);
            id(disp1).send_command_printf("dim=%d", b);
    - action: set_clock_format
      variables:
        h24: bool
      then:
        - globals.set:
            id: clock_24h
            value: !lambda return h24;
        - script.execute: update_clock
    - action: set_button_mode
      variables:
        button: string
        relay: bool
      then:
        - lambda: |-
            if (button == "left") id(left_relay_mode) = relay;
            else if (button == "right") id(right_relay_mode) = relay;
    - action: play_rtttl
      variables:
        tone: string
      then:
        - rtttl.play:
            rtttl: !lambda return tone;
    - action: upload_tft
      variables:
        url: string
      then:
        - lambda: |-
            id(disp1).set_tft_url(url);
            id(disp1).upload_tft();

ota:
  - platform: esphome
    password: !secret ota_password

globals:
  - id: clock_24h
    type: bool
    restore_value: true
    initial_value: "true"
  - id: left_relay_mode
    type: bool
    restore_value: true
    initial_value: "true"
  - id: right_relay_mode
    type: bool
    restore_value: true
    initial_value: "true"

time:
  - platform: sntp
    id: sntp_time
    timezone: Europe/Brussels
    on_time_sync:
      - script.execute: update_clock
    on_time:
      - seconds: 0
        then:
          - script.execute: update_clock

uart:
  id: tf_uart
  tx_pin: 16
  rx_pin: 17
  baud_rate: 115200

display:
  - platform: nextion
    id: disp1
    uart_id: tf_uart
    update_interval: never
    tft_url: "http://127.0.0.1/nspanel.tft"
    on_page:
      - lambda: |-
          nspanel_ui::cache().on_page(id(disp1), x);
          id(current_page).publish_state(nspanel_ui::page_name(x));
      - script.execute:
          id: send_ui_event
          type: page
          page: !lambda return nspanel_ui::page_name(x);
          slot: ""
          value: ""

text_sensor:
  # The Blackymas TFT writes CSV "<page>,<event>,<component>" into the `localevent` variable.
  - platform: nextion
    nextion_id: disp1
    id: localevent
    component_name: localevent
    internal: true
    on_value:
      - lambda: |-
          auto p = nspanel_ui::split_csv(x);
          if (p.size() < 2) return;
          if (p[0] == "boot" && p[1] == "params") {
            // Boot handshake: stop the TFT's 1 s retry timer (it reboots after 60 tries), then leave boot page.
            id(disp1).send_command("tm_esphome.en=0");
            if (p.size() >= 5) id(tft_version).publish_state(p[4]);
            id(disp1).send_command("page home");
            return;
          }
          std::string slot = p.size() >= 3 ? p[2] : "";
          id(send_ui_event).execute("touch", p[0], slot, p[1]);
  - platform: template
    id: tft_version
    name: Version TFT
    entity_category: diagnostic
  - platform: template
    id: current_page
    name: Current page
    entity_category: diagnostic
  - platform: version
    name: Version ESPHome
    hide_timestamp: true

script:
  - id: send_ui_event
    mode: queued
    max_runs: 20
    parameters:
      type: string
      page: string
      slot: string
      value: string
    then:
      - homeassistant.event:
          event: esphome.nspanel_ui
          data:
            type: !lambda return type;
            page: !lambda return page;
            slot: !lambda return slot;
            value: !lambda return value;
  - id: update_clock
    then:
      - lambda: |-
          auto now = id(sntp_time).now();
          if (!now.is_valid()) return;
          nspanel_ui::cache().set(id(disp1), "home.time.txt", now.strftime(id(clock_24h) ? "%H:%M" : "%I:%M"));
          nspanel_ui::cache().set(id(disp1), "home.meridiem.txt", id(clock_24h) ? "" : (now.hour < 12 ? "AM" : "PM"));
  - id: hw_button
    mode: queued
    parameters:
      button: string
      action: string
    then:
      - lambda: |-
          if (action == "short") {
            if (button == "left" && id(left_relay_mode)) id(relay_1).toggle();
            if (button == "right" && id(right_relay_mode)) id(relay_2).toggle();
          }
          id(send_ui_event).execute("hw_button", "", button, action);

binary_sensor:
  - platform: gpio
    id: left_button
    name: Left Button
    pin:
      number: 14
      inverted: true
    on_click:
      - min_length: 20ms
        max_length: 600ms
        then:
          - script.execute: { id: hw_button, button: left, action: short }
      - min_length: 800ms
        max_length: 5s
        then:
          - script.execute: { id: hw_button, button: left, action: long }
  - platform: gpio
    id: right_button
    name: Right Button
    pin:
      number: 27
      inverted: true
    on_click:
      - min_length: 20ms
        max_length: 600ms
        then:
          - script.execute: { id: hw_button, button: right, action: short }
      - min_length: 800ms
        max_length: 5s
        then:
          - script.execute: { id: hw_button, button: right, action: long }

switch:
  - platform: gpio
    id: relay_1
    name: Relay 1
    pin: 22
    restore_mode: RESTORE_DEFAULT_OFF
    on_turn_on:
      - lambda: nspanel_ui::cache().set(id(disp1), "home.chip_relay1.txt", "${icon_relay_on}");
    on_turn_off:
      - lambda: nspanel_ui::cache().set(id(disp1), "home.chip_relay1.txt", "");
  - platform: gpio
    id: relay_2
    name: Relay 2
    pin: 19
    restore_mode: RESTORE_DEFAULT_OFF
    on_turn_on:
      - lambda: nspanel_ui::cache().set(id(disp1), "home.chip_relay2.txt", "${icon_relay_on}");
    on_turn_off:
      - lambda: nspanel_ui::cache().set(id(disp1), "home.chip_relay2.txt", "");

sensor:
  - platform: wifi_signal
    name: RSSI
    update_interval: 60s
  - platform: adc
    id: ntc_source
    pin: 38
    attenuation: 12db
    samples: 16
    update_interval: 1s
    internal: true
    filters:
      - median:
          window_size: 5
          send_every: 1
          send_first_at: 1
      - exponential_moving_average:
          alpha: 0.2
          send_every: 1
          send_first_at: 1
      - delta: 0.002
      - heartbeat: 5min
  - platform: resistance
    id: resistance_sensor
    sensor: ntc_source
    configuration: DOWNSTREAM
    resistor: 11.2kOhm
    internal: true
  - platform: ntc
    id: temp_nspanel
    name: Temperature
    sensor: resistance_sensor
    unit_of_measurement: °C
    accuracy_decimals: 1
    calibration:
      b_constant: 3950
      reference_temperature: 25°C
      reference_resistance: 10kOhm
    filters:
      - delta: 0.1

output:
  - platform: ledc
    id: buzzer_out
    pin: 21

rtttl:
  output: buzzer_out
```

- [ ] **Step 3: Write `firmware/secrets.example.yaml`**

```yaml
# Copy to secrets.yaml (gitignored) and fill in.
wifi_ssid: "your-ssid"
wifi_password: "your-wifi-password"
# Reuse the key currently set in the Homey device settings so Homey keeps connecting.
api_encryption_key: "base64-32-byte-key"
# Must equal the OTA password of the firmware currently on the panel, or OTA is rejected.
ota_password: "current-ota-password"
```

- [ ] **Step 4: Validate and compile**

```bash
cp firmware/secrets.example.yaml firmware/secrets.yaml
# use a syntactically valid dummy key for the compile check:
sed -i '' 's|base64-32-byte-key|MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=|' firmware/secrets.yaml
esphome config firmware/nspanel.yaml | tail -1
esphome compile firmware/nspanel.yaml 2>&1 | grep -E "SUCCESS|FAILED|error:"
```

Expected: `INFO Configuration is valid!`, then `SUCCESS` (flash ≈ 58 %). Afterwards, put the real values from Task 1 into `firmware/secrets.yaml`. It is gitignored.

- [ ] **Step 5: Write `firmware/README.md`**

```markdown
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
```

- [ ] **Step 6: Commit**

```bash
git add firmware/nspanel.yaml firmware/nspanel_ui.h firmware/secrets.example.yaml firmware/README.md
git commit -m "feat(firmware): thin ESPHome firmware with set_props cache and nspanel_ui events"
```

---

### Task 3: Test tooling, icons and config schema

**Files:**
- Modify: `package.json`, `tsconfig.json`
- Create: `.homeyignore`, `scripts/extract-icons.ts`, `lib/icons.json`, `lib/config.ts`, `tests/config.test.ts`

**Interfaces:**
- Produces:
  - `CHIP_SLOTS = 7`, `VALUE_SLOTS = 4`
  - `interface ChipConfig { deviceId: string; capability: string; icon: string }`
  - `interface ValueConfig { deviceId: string; capability: string; icon: string; unit: string }`
  - `type ButtonMode = 'relay' | 'event'`
  - `interface DashboardConfig { version: 1; home: { thermostat: { deviceId: string } | null; chips: Array<ChipConfig | null>; values: Array<ValueConfig | null> }; buttons: { left: ButtonMode; right: ButtonMode } }`
  - `interface CapabilityRef { deviceId: string; capability: string }`
  - `capKey(deviceId: string, capability: string): string` → `"<deviceId>:<capability>"`
  - `defaultConfig(): DashboardConfig`
  - `normalizeConfig(raw: unknown): DashboardConfig`
  - `migrateLegacy(legacy: unknown): DashboardConfig`
  - `loadConfig(store: { dashboardConfig?: unknown; nspanelConfig?: unknown }): DashboardConfig`
  - `watchedCapabilities(config: DashboardConfig): CapabilityRef[]`

- [ ] **Step 1: Add the test script and the new dependency**

Edit `package.json` so `scripts` and `dependencies` read:

```json
  "scripts": {
    "build": "tsc",
    "lint": "eslint --ext .js,.ts --ignore-path .gitignore --ignore-pattern tests --ignore-pattern scripts .",
    "test": "bun test"
  },
  "dependencies": {
    "@2colors/esphome-native-api": "^1.3.6",
    "homey-api": "^3.14.23"
  }
```

The `postinstall` patch script goes away, and `esphome-native-api` is no longer listed.

Keep tests and Bun-only scripts out of the Homey TypeScript build. In `tsconfig.json`, set:

```json
  "exclude": ["node_modules", ".homeybuild", "tests", "scripts"]
```

Create `.homeyignore` so the Homey CLI doesn't upload non-app folders:

```
tests/
scripts/
docs/
firmware/
```

Then:

```bash
rm -f package-lock.json
bun install
```

The old `drivers/nspanel/device.ts` still imports `esphome-native-api`, so `tsc` is expected to fail until Task 10. Don't run `bun run build` before then.

- [ ] **Step 2: Generate the icon map**

`scripts/extract-icons.ts`:

```ts
// Usage: bun scripts/extract-icons.ts <path-to-NSPanel_HA_Blueprint-checkout>
// Writes lib/icons.json: { "<mdi-name>": "<glyph>" } from the blueprint's all_icons map.
const root = process.argv[2];
if (!root) throw new Error('Pass the path to a NSPanel_HA_Blueprint checkout');
const src = await Bun.file(`${root}/nspanel_blueprint.yaml`).text();
const start = src.indexOf('all_icons: {');
if (start < 0) throw new Error('all_icons not found');
const body = src.slice(start + 'all_icons: {'.length, src.indexOf('}', start));
const icons: Record<string, string> = {};
for (const m of body.matchAll(/([a-z0-9-]+): "\\u([0-9A-F]{4})"/g)) {
  if (m[1] === 'blank' || m[1] === 'void') continue;
  icons[m[1]] = String.fromCharCode(parseInt(m[2], 16));
}
await Bun.write('lib/icons.json', `${JSON.stringify(icons)}\n`);
console.log(`Wrote ${Object.keys(icons).length} icons`);
```

Run:

```bash
git clone -q --depth 1 --branch v2026041 --filter=blob:limit=1m https://github.com/Blackymas/NSPanel_HA_Blueprint /tmp/blackymas
bun scripts/extract-icons.ts /tmp/blackymas
```

Expected: `Wrote 689x icons` (about 6,900). Spot-check with `bun -e 'console.log(require("./lib/icons.json").lightbulb.codePointAt(0).toString(16))'` → `e334`.

- [ ] **Step 3: Write the failing tests** — `tests/config.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import {
  CHIP_SLOTS, VALUE_SLOTS, capKey, defaultConfig, loadConfig, migrateLegacy, normalizeConfig, watchedCapabilities,
} from '../lib/config';

describe('config', () => {
  test('defaults have empty slots and relay buttons', () => {
    const c = defaultConfig();
    expect(c.version).toBe(1);
    expect(c.home.thermostat).toBeNull();
    expect(c.home.chips).toHaveLength(CHIP_SLOTS);
    expect(c.home.values).toHaveLength(VALUE_SLOTS);
    expect(c.home.chips.every((x) => x === null)).toBe(true);
    expect(c.buttons).toEqual({ left: 'relay', right: 'relay' });
  });

  test('normalize pads, truncates and drops incomplete slots', () => {
    const c = normalizeConfig({
      home: {
        chips: [{ deviceId: 'd1', capability: 'onoff', icon: 'X' }, { deviceId: 'd2' }, ...Array(10).fill(null)],
        values: [{ deviceId: 'd3', capability: 'measure_power', icon: 'Y', unit: 'W' }],
        thermostat: { deviceId: 't1' },
      },
      buttons: { left: 'event', right: 'bogus' },
    });
    expect(c.home.chips).toHaveLength(CHIP_SLOTS);
    expect(c.home.chips[0]).toEqual({ deviceId: 'd1', capability: 'onoff', icon: 'X' });
    expect(c.home.chips[1]).toBeNull();
    expect(c.home.values[0]).toEqual({ deviceId: 'd3', capability: 'measure_power', icon: 'Y', unit: 'W' });
    expect(c.home.values[1]).toBeNull();
    expect(c.home.thermostat).toEqual({ deviceId: 't1' });
    expect(c.buttons).toEqual({ left: 'event', right: 'relay' });
  });

  test('migrates legacy nspanelConfig', () => {
    const c = migrateLegacy({
      chips: [{ device: 'd1', capability: 'alarm_contact', icon: 'A', unit: '' }],
      entities: [{ device: 'd2', capability: 'measure_temperature', icon: 'B', label: 'Living' }],
    });
    expect(c.home.chips[0]).toEqual({ deviceId: 'd1', capability: 'alarm_contact', icon: 'A' });
    expect(c.home.values[0]).toEqual({ deviceId: 'd2', capability: 'measure_temperature', icon: 'B', unit: '' });
  });

  test('decodes escaped icon text from the old settings page', () => {
    const c = migrateLegacy({ chips: [{ device: 'd1', capability: 'onoff', icon: '\\uE335' }] });
    expect(c.home.chips[0]?.icon).toBe('\uE335');
  });

  test('loadConfig prefers dashboardConfig over legacy', () => {
    const c = loadConfig({
      dashboardConfig: { home: { thermostat: { deviceId: 'new' } } },
      nspanelConfig: { chips: [{ device: 'old', capability: 'onoff', icon: '' }] },
    });
    expect(c.home.thermostat).toEqual({ deviceId: 'new' });
    expect(c.home.chips[0]).toBeNull();
    expect(loadConfig({}).home.chips[0]).toBeNull();
  });

  test('watchedCapabilities includes thermostat and dedupes', () => {
    const c = normalizeConfig({
      home: {
        thermostat: { deviceId: 't' },
        chips: [{ deviceId: 'd', capability: 'onoff', icon: '' }],
        values: [{ deviceId: 'd', capability: 'onoff', icon: '', unit: '' }],
      },
    });
    expect(watchedCapabilities(c).map((r) => capKey(r.deviceId, r.capability))).toEqual([
      'd:onoff', 't:measure_temperature', 't:target_temperature',
    ]);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `bun test tests/config.test.ts`
Expected: FAIL — `Cannot find module '../lib/config'`.

- [ ] **Step 5: Implement `lib/config.ts`**

```ts
export const CHIP_SLOTS = 7;
export const VALUE_SLOTS = 4;

export interface ChipConfig { deviceId: string; capability: string; icon: string }
export interface ValueConfig { deviceId: string; capability: string; icon: string; unit: string }
export type ButtonMode = 'relay' | 'event';

export interface DashboardConfig {
  version: 1;
  home: {
    thermostat: { deviceId: string } | null;
    chips: Array<ChipConfig | null>;
    values: Array<ValueConfig | null>;
  };
  buttons: { left: ButtonMode; right: ButtonMode };
}

export interface CapabilityRef { deviceId: string; capability: string }

type Obj = Record<string, unknown>;

export const capKey = (deviceId: string, capability: string): string => `${deviceId}:${capability}`;

const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const mode = (v: unknown): ButtonMode => (v === 'event' ? 'event' : 'relay');

// The old settings page stored icons as the 6-character text "\uE335" instead of the glyph.
const decodeIcon = (v: unknown): string => str(v).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

function slots<T>(raw: unknown, count: number, parse: (item: Obj) => T | null): Array<T | null> {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => (arr[i] && typeof arr[i] === 'object' ? parse(arr[i] as Obj) : null));
}

function parseChip(item: Obj): ChipConfig | null {
  const deviceId = str(item.deviceId);
  const capability = str(item.capability);
  return deviceId && capability ? { deviceId, capability, icon: decodeIcon(item.icon) } : null;
}

function parseValue(item: Obj): ValueConfig | null {
  const deviceId = str(item.deviceId);
  const capability = str(item.capability);
  return deviceId && capability ? { deviceId, capability, icon: decodeIcon(item.icon), unit: str(item.unit) } : null;
}

export function normalizeConfig(raw: unknown): DashboardConfig {
  const r = obj(raw);
  const home = obj(r.home);
  const buttons = obj(r.buttons);
  const thermostatId = str(obj(home.thermostat).deviceId);
  return {
    version: 1,
    home: {
      thermostat: thermostatId ? { deviceId: thermostatId } : null,
      chips: slots(home.chips, CHIP_SLOTS, parseChip),
      values: slots(home.values, VALUE_SLOTS, parseValue),
    },
    buttons: { left: mode(buttons.left), right: mode(buttons.right) },
  };
}

export const defaultConfig = (): DashboardConfig => normalizeConfig({});

export function migrateLegacy(legacy: unknown): DashboardConfig {
  const l = obj(legacy);
  const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
  return normalizeConfig({
    home: {
      chips: list(l.chips).map((c) => ({ deviceId: c.device, capability: c.capability, icon: c.icon })),
      values: list(l.entities).map((e) => ({ deviceId: e.device, capability: e.capability, icon: e.icon, unit: '' })),
    },
  });
}

export function loadConfig(store: { dashboardConfig?: unknown; nspanelConfig?: unknown }): DashboardConfig {
  if (store.dashboardConfig) return normalizeConfig(store.dashboardConfig);
  if (store.nspanelConfig) return migrateLegacy(store.nspanelConfig);
  return defaultConfig();
}

export function watchedCapabilities(config: DashboardConfig): CapabilityRef[] {
  const refs: CapabilityRef[] = [...config.home.chips, ...config.home.values]
    .filter((s): s is ChipConfig | ValueConfig => s !== null)
    .map(({ deviceId, capability }) => ({ deviceId, capability }));
  const t = config.home.thermostat;
  if (t) {
    refs.push({ deviceId: t.deviceId, capability: 'measure_temperature' }, { deviceId: t.deviceId, capability: 'target_temperature' });
  }
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = capKey(r.deviceId, r.capability);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
```

- [ ] **Step 6: Run tests**

Run: `bun test tests/config.test.ts`
Expected: 6 pass.

- [ ] **Step 7: Commit**

```bash
git add -A package.json package-lock.json bun.lock tsconfig.json .homeyignore scripts/extract-icons.ts lib/icons.json lib/config.ts tests/config.test.ts
git commit -m "feat: dashboard config schema with legacy migration; icon map; bun test"
```

---

### Task 4: i18n and value formatting

**Files:**
- Create: `lib/i18n/index.ts`, `lib/i18n/en.json`, `lib/i18n/nl.json`, `tests/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type Lang = 'nl' | 'en'`
  - `toLang(v: unknown): Lang` (anything but `'en'` → `'nl'`)
  - `t(lang: Lang, key: 'on' | 'off'): string`
  - `formatDate(date: Date, format: string, lang: Lang, timeZone: string): string`
  - `formatNumber(value: number, decimals: number, lang: Lang): string`
  - `formatValue(value: unknown, opts: { lang: Lang; unit?: string }): string`
  - `isActive(value: unknown): boolean`

- [ ] **Step 1: Write the failing tests** — `tests/i18n.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { formatDate, formatNumber, formatValue, isActive, t, toLang } from '../lib/i18n';

const MON_NOON = new Date('2026-10-12T10:00:00Z');

describe('i18n', () => {
  test('toLang defaults to nl', () => {
    expect(toLang('en')).toBe('en');
    expect(toLang('fr')).toBe('nl');
    expect(toLang(undefined)).toBe('nl');
  });

  test('strings', () => {
    expect(t('nl', 'on')).toBe('Aan');
    expect(t('en', 'off')).toBe('Off');
  });

  test('formatDate default format per language', () => {
    expect(formatDate(MON_NOON, 'ddd DD MMM', 'en', 'Europe/Brussels')).toBe('Mon 12 Oct');
    expect(formatDate(MON_NOON, 'ddd DD MMM', 'nl', 'Europe/Brussels')).toBe('ma 12 okt');
  });

  test('formatDate numeric formats', () => {
    expect(formatDate(MON_NOON, 'DD/MM/YYYY', 'nl', 'Europe/Brussels')).toBe('12/10/2026');
    expect(formatDate(MON_NOON, 'MM/DD/YYYY', 'en', 'Europe/Brussels')).toBe('10/12/2026');
    expect(formatDate(MON_NOON, 'YYYY-MM-DD', 'en', 'Europe/Brussels')).toBe('2026-10-12');
    expect(formatDate(MON_NOON, 'DD MMM YYYY', 'nl', 'Europe/Brussels')).toBe('12 okt 2026');
  });

  test('formatDate uses the given timezone, not UTC', () => {
    const lateUtc = new Date('2026-10-12T23:30:00Z'); // 01:30 on the 13th in Brussels
    expect(formatDate(lateUtc, 'ddd DD MMM', 'nl', 'Europe/Brussels')).toBe('di 13 okt');
    expect(formatDate(lateUtc, 'YYYY-MM-DD', 'nl', 'UTC')).toBe('2026-10-12');
  });

  test('formatNumber uses locale decimal separator', () => {
    expect(formatNumber(21.46, 1, 'nl')).toBe('21,5');
    expect(formatNumber(21.46, 1, 'en')).toBe('21.5');
    expect(formatNumber(1234, 0, 'nl')).toBe('1234');
  });

  test('formatValue', () => {
    expect(formatValue(null, { lang: 'nl' })).toBe('--');
    expect(formatValue(true, { lang: 'nl' })).toBe('Aan');
    expect(formatValue(1500, { lang: 'nl', unit: ' W' })).toBe('1500 W');
    expect(formatValue(21.25, { lang: 'nl', unit: '°' })).toBe('21,3°');
    expect(formatValue('heat', { lang: 'en' })).toBe('heat');
  });

  test('isActive', () => {
    expect(isActive(true)).toBe(true);
    expect(isActive(false)).toBe(false);
    expect(isActive(0)).toBe(false);
    expect(isActive(3)).toBe(true);
    expect(isActive('off')).toBe(false);
    expect(isActive('')).toBe(false);
    expect(isActive('on')).toBe(true);
    expect(isActive(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/i18n.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/i18n/en.json`:

```json
{ "on": "On", "off": "Off" }
```

`lib/i18n/nl.json`:

```json
{ "on": "Aan", "off": "Uit" }
```

`lib/i18n/index.ts`:

```ts
import en from './en.json';
import nl from './nl.json';

export type Lang = 'nl' | 'en';
type StringKey = keyof typeof en;

const STRINGS: Record<Lang, Record<StringKey, string>> = { nl, en };
const LOCALES: Record<Lang, string> = { nl: 'nl-BE', en: 'en-GB' };

export const toLang = (v: unknown): Lang => (v === 'en' ? 'en' : 'nl');

export const t = (lang: Lang, key: StringKey): string => STRINGS[lang][key];

export function formatDate(date: Date, format: string, lang: Lang, timeZone: string): string {
  const named = new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(date);
  const numeric = new Intl.DateTimeFormat('en-GB', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(date);
  // CLDR abbreviations carry a trailing dot in some locales (nl: "okt.")
  const name = (type: string): string => (named.find((p) => p.type === type)?.value ?? '').replace(/\.$/, '');
  const num = (type: string): string => numeric.find((p) => p.type === type)?.value ?? '';
  const day = String(Number(num('day')));

  switch (format) {
    case 'DD/MM/YYYY': return `${num('day')}/${num('month')}/${num('year')}`;
    case 'MM/DD/YYYY': return `${num('month')}/${num('day')}/${num('year')}`;
    case 'YYYY-MM-DD': return `${num('year')}-${num('month')}-${num('day')}`;
    case 'DD MMM YYYY': return `${day} ${name('month')} ${num('year')}`;
    case 'ddd DD MMM':
    default: return `${name('weekday')} ${day} ${name('month')}`;
  }
}

export function formatNumber(value: number, decimals: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false,
  }).format(value);
}

export function formatValue(value: unknown, opts: { lang: Lang; unit?: string }): string {
  const unit = opts.unit ?? '';
  if (value === null || value === undefined) return '--';
  if (typeof value === 'boolean') return t(opts.lang, value ? 'on' : 'off');
  if (typeof value === 'number') return `${formatNumber(value, Number.isInteger(value) ? 0 : 1, opts.lang)}${unit}`;
  return `${String(value)}${unit}`;
}

export function isActive(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '' && value !== 'off' && value !== 'idle';
  return false;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/i18n.test.ts`
Expected: all pass. If the `nl` weekday or month assertions fail because the ICU data differs, print `formatToParts` output and adjust **the stripping logic**, not the expected strings. The panel must show `ma 12 okt`.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n tests/i18n.test.ts
git commit -m "feat: i18n strings and locale-aware date/value formatting"
```

---

### Task 5: Weather

**Files:**
- Create: `lib/weather.ts`, `tests/weather.test.ts`

**Interfaces:**
- Produces:
  - `interface WeatherNow { temperature: number; code: number; isDay: boolean }`
  - `type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`
  - `fetchWeather(lat: number, lon: number, fetchFn?: FetchFn): Promise<WeatherNow>`
  - `weatherPicture(code: number, isDay: boolean): number` (Blackymas TFT picture ids)

- [ ] **Step 1: Write the failing tests** — `tests/weather.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { fetchWeather, weatherPicture } from '../lib/weather';

describe('weatherPicture', () => {
  test.each([
    [0, true, 2], [0, false, 15], [2, true, 11], [2, false, 12], [3, true, 3], [45, true, 8],
    [61, true, 4], [65, true, 5], [81, true, 5], [71, true, 6], [67, true, 7], [95, true, 13],
    [95, false, 14], [99, true, 10], [12345, true, 2],
  ])('code %i day=%p → %i', (code, isDay, pic) => {
    expect(weatherPicture(code as number, isDay as boolean)).toBe(pic as number);
  });
});

describe('fetchWeather', () => {
  test('parses current conditions', async () => {
    let requested = '';
    const w = await fetchWeather(51.05, 3.72, async (url) => {
      requested = url;
      return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 12.4, weather_code: 3, is_day: 0 } }) };
    });
    expect(requested).toContain('latitude=51.05');
    expect(requested).toContain('current=temperature_2m,weather_code,is_day');
    expect(w).toEqual({ temperature: 12.4, code: 3, isDay: false });
  });

  test('throws on HTTP error and on malformed body', async () => {
    await expect(fetchWeather(0, 0, async () => ({ ok: false, status: 503, json: async () => ({}) }))).rejects.toThrow('503');
    await expect(fetchWeather(0, 0, async () => ({ ok: true, status: 200, json: async () => ({}) }))).rejects.toThrow('unexpected');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/weather.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/weather.ts`**

```ts
export interface WeatherNow { temperature: number; code: number; isDay: boolean }
export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function fetchWeather(lat: number, lon: number, fetchFn: FetchFn = fetch): Promise<WeatherNow> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code,is_day&timezone=auto';
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json() as { current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown } };
  const c = data.current;
  if (!c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') {
    throw new Error('Open-Meteo: unexpected response');
  }
  return { temperature: c.temperature_2m, code: c.weather_code, isDay: c.is_day !== 0 };
}

// WMO weather code → picture id in the Blackymas TFT (see blueprint `nextion.pic.weather`).
export function weatherPicture(code: number, isDay: boolean): number {
  switch (code) {
    case 0: return isDay ? 2 : 15; // clear
    case 1: case 2: return isDay ? 11 : 12; // partly cloudy
    case 3: return 3; // cloudy
    case 45: case 48: return 8; // fog
    case 51: case 53: case 55: case 61: case 63: return 4; // rainy
    case 65: case 80: case 81: case 82: return 5; // pouring
    case 71: case 73: case 75: case 77: case 85: case 86: return 6; // snowy
    case 56: case 57: case 66: case 67: return 7; // snowy-rainy
    case 95: return isDay ? 13 : 14; // lightning-rainy
    case 96: case 99: return 10; // lightning (with hail)
    default: return isDay ? 2 : 15;
  }
}
```

- [ ] **Step 4: Run tests** — `bun test tests/weather.test.ts` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/weather.ts tests/weather.test.ts
git commit -m "feat: Open-Meteo client and WMO→TFT picture mapping"
```

---

### Task 6: Home view

**Files:**
- Create: `lib/panel/homeView.ts`, `tests/homeView.test.ts`

**Interfaces:**
- Consumes: `DashboardConfig`, `capKey` (Task 3); `Lang`, `formatNumber`, `formatValue`, `isActive` (Task 4); `WeatherNow`, `weatherPicture` (Task 5).
- Produces:
  - `ICON_THERMOMETER = '\uE50E'`
  - `interface HomeState { lang: Lang; dateText: string; values: ReadonlyMap<string, unknown>; weather: WeatherNow | null; panelTemperature: number | null }`
  - `buildHomeProps(config: DashboardConfig, state: HomeState): Record<string, string>`

- [ ] **Step 1: Write the failing tests** — `tests/homeView.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { normalizeConfig } from '../lib/config';
import { ICON_THERMOMETER, buildHomeProps, HomeState } from '../lib/panel/homeView';

const base: HomeState = { lang: 'nl', dateText: 'ma 12 okt', values: new Map(), weather: null, panelTemperature: null };

describe('buildHomeProps', () => {
  test('hides Blackymas chrome we do not use', () => {
    const p = buildHomeProps(normalizeConfig({}), base);
    expect(p['home.button01.vis']).toBe('0');
    expect(p['home.button07.vis']).toBe('0');
    expect(p['home.bt_notific.vis']).toBe('0');
    expect(p['home.bt_utilities.vis']).toBe('0');
    expect(p['home.date.txt']).toBe('ma 12 okt');
  });

  test('weather present and absent', () => {
    expect(buildHomeProps(normalizeConfig({}), base)['home.weather.vis']).toBe('0');
    const p = buildHomeProps(normalizeConfig({}), { ...base, weather: { temperature: 12.6, code: 3, isDay: true } });
    expect(p['home.outdoor_temp.txt']).toBe('13°');
    expect(p['home.weather.pic']).toBe('3');
    expect(p['home.weather.vis']).toBe('1');
  });

  test('indoor temp prefers thermostat, falls back to panel sensor', () => {
    const cfg = normalizeConfig({ home: { thermostat: { deviceId: 't' } } });
    const withThermo = buildHomeProps(cfg, { ...base, panelTemperature: 19, values: new Map([['t:measure_temperature', 21.46]]) });
    expect(withThermo['home.indr_temp.txt']).toBe('21,5°');
    expect(withThermo['home.indr_temp_icon.txt']).toBe(ICON_THERMOMETER);
    expect(buildHomeProps(cfg, { ...base, panelTemperature: 19 })['home.indr_temp.txt']).toBe('19,0°');
    expect(buildHomeProps(normalizeConfig({}), base)['home.indr_temp.txt']).toBe('');
  });

  test('chips show their icon only when active', () => {
    const cfg = normalizeConfig({ home: { chips: [
      { deviceId: 'a', capability: 'alarm_contact', icon: 'D' },
      { deviceId: 'b', capability: 'onoff', icon: 'L' },
    ] } });
    const p = buildHomeProps(cfg, { ...base, values: new Map<string, unknown>([['a:alarm_contact', true], ['b:onoff', false]]) });
    expect(p['home.chip01.txt']).toBe('D');
    expect(p['home.chip02.txt']).toBe('');
    expect(p['home.chip07.txt']).toBe('');
  });

  test('values render formatted text and icon; unknown values show --', () => {
    const cfg = normalizeConfig({ home: { values: [
      { deviceId: 'p', capability: 'measure_power', icon: 'P', unit: ' W' },
      { deviceId: 'gone', capability: 'measure_power', icon: 'G', unit: ' W' },
    ] } });
    const p = buildHomeProps(cfg, { ...base, values: new Map([['p:measure_power', 1500]]) });
    expect(p['home.value01.txt']).toBe('1500 W');
    expect(p['home.value01_icon.txt']).toBe('P');
    expect(p['home.value02.txt']).toBe('--');
    expect(p['home.value03.txt']).toBe('');
    expect(p['home.value03_icon.txt']).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test tests/homeView.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/panel/homeView.ts`**

```ts
import { DashboardConfig, capKey } from '../config';
import { Lang, formatNumber, formatValue, isActive } from '../i18n';
import { WeatherNow, weatherPicture } from '../weather';

export const ICON_THERMOMETER = '\uE50E';

export interface HomeState {
  lang: Lang;
  dateText: string;
  values: ReadonlyMap<string, unknown>;
  weather: WeatherNow | null;
  panelTemperature: number | null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function buildHomeProps(config: DashboardConfig, state: HomeState): Record<string, string> {
  const { lang } = state;
  const get = (deviceId: string, capability: string): unknown => state.values.get(capKey(deviceId, capability));
  const p: Record<string, string> = {};

  // Blackymas home chrome that this dashboard does not use.
  for (let i = 1; i <= 7; i++) p[`home.button${pad(i)}.vis`] = '0';
  for (const id of ['bt_notific', 'bt_qrcode', 'bt_entities', 'bt_utilities']) p[`home.${id}.vis`] = '0';
  for (const id of ['wifi_icon', 'bt_icon', 'chip_climate', 'left_bt_text', 'right_bt_text']) p[`home.${id}.txt`] = '';

  p['home.date.txt'] = state.dateText;

  if (state.weather) {
    p['home.outdoor_temp.txt'] = `${formatNumber(Math.round(state.weather.temperature), 0, lang)}°`;
    p['home.weather.pic'] = String(weatherPicture(state.weather.code, state.weather.isDay));
    p['home.weather.vis'] = '1';
  } else {
    p['home.outdoor_temp.txt'] = '';
    p['home.weather.vis'] = '0';
  }

  const thermostat = config.home.thermostat;
  const current = thermostat ? get(thermostat.deviceId, 'measure_temperature') : undefined;
  const indoor = typeof current === 'number' ? current : state.panelTemperature;
  p['home.indr_temp.txt'] = typeof indoor === 'number' ? `${formatNumber(indoor, 1, lang)}°` : '';
  p['home.indr_temp_icon.txt'] = typeof indoor === 'number' ? ICON_THERMOMETER : '';

  config.home.chips.forEach((chip, i) => {
    p[`home.chip${pad(i + 1)}.txt`] = chip && isActive(get(chip.deviceId, chip.capability)) ? chip.icon : '';
  });

  config.home.values.forEach((v, i) => {
    const n = pad(i + 1);
    p[`home.value${n}.txt`] = v ? formatValue(get(v.deviceId, v.capability) ?? null, { lang, unit: v.unit }) : '';
    p[`home.value${n}_icon.txt`] = v ? v.icon : '';
  });

  return p;
}
```

- [ ] **Step 4: Run tests** — `bun test tests/homeView.test.ts` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/panel/homeView.ts tests/homeView.test.ts
git commit -m "feat: pure home-page view model for the Blackymas home page"
```

---

### Task 7: Panel renderer

**Files:**
- Create: `lib/panel/PanelRenderer.ts`, `tests/PanelRenderer.test.ts`

**Interfaces:**
- Produces:
  - `type SendProps = (keys: string[], values: string[]) => Promise<void>`
  - `type Schedule = (fn: () => void, ms: number) => void`
  - `MAX_BATCH = 40`
  - `class PanelRenderer { constructor(send: SendProps, schedule?: Schedule, windowMs?: number, onError?: (err: unknown) => void); update(props: Record<string, string>): void; reset(): void; flush(): Promise<void> }`

- [ ] **Step 1: Write the failing tests** — `tests/PanelRenderer.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { MAX_BATCH, PanelRenderer } from '../lib/panel/PanelRenderer';

function setup() {
  const calls: Array<[string[], string[]]> = [];
  const timers: Array<() => void> = [];
  const r = new PanelRenderer(async (k, v) => { calls.push([k, v]); }, (fn) => { timers.push(fn); }, 50);
  const tick = async () => { const fns = timers.splice(0); fns.forEach((f) => f()); await Promise.resolve(); await Promise.resolve(); };
  return { r, calls, timers, tick };
}

describe('PanelRenderer', () => {
  test('coalesces updates within one window into one call', async () => {
    const { r, calls, timers, tick } = setup();
    r.update({ 'home.a.txt': '1' });
    r.update({ 'home.b.txt': '2' });
    expect(timers).toHaveLength(1);
    await tick();
    expect(calls).toEqual([[['home.a.txt', 'home.b.txt'], ['1', '2']]]);
  });

  test('does not resend unchanged values', async () => {
    const { r, calls, timers, tick } = setup();
    r.update({ 'home.a.txt': '1' });
    await tick();
    r.update({ 'home.a.txt': '1' });
    expect(timers).toHaveLength(0);
    r.update({ 'home.a.txt': '2', 'home.b.txt': 'x' });
    await tick();
    expect(calls[1]).toEqual([['home.a.txt', 'home.b.txt'], ['2', 'x']]);
  });

  test('reset() makes the next update resend everything', async () => {
    const { r, calls, tick } = setup();
    r.update({ 'home.a.txt': '1', 'home.b.txt': '2' });
    await tick();
    r.reset();
    r.update({});
    await tick();
    expect(calls[1]).toEqual([['home.a.txt', 'home.b.txt'], ['1', '2']]);
  });

  test('splits large updates into batches', async () => {
    const { r, calls } = setup();
    const props: Record<string, string> = {};
    for (let i = 0; i < MAX_BATCH + 5; i++) props[`home.c${i}.txt`] = String(i);
    r.update(props);
    await r.flush();
    expect(calls.map(([k]) => k.length)).toEqual([MAX_BATCH, 5]);
  });

  test('failed send is retried on the next flush', async () => {
    let fail = true;
    const sent: string[][] = [];
    const r = new PanelRenderer(async (k) => { if (fail) throw new Error('offline'); sent.push(k); }, () => {}, 50);
    r.update({ 'home.a.txt': '1' });
    await expect(r.flush()).rejects.toThrow('offline');
    fail = false;
    await r.flush();
    expect(sent).toEqual([['home.a.txt']]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test tests/PanelRenderer.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/panel/PanelRenderer.ts`**

```ts
export type SendProps = (keys: string[], values: string[]) => Promise<void>;
export type Schedule = (fn: () => void, ms: number) => void;

export const MAX_BATCH = 40;

// Keeps the desired panel state, sends only what changed, and coalesces bursts.
export class PanelRenderer {
  private readonly desired = new Map<string, string>();
  private readonly sent = new Map<string, string>();
  private scheduled = false;

  constructor(
    private readonly send: SendProps,
    private readonly schedule: Schedule = (fn, ms) => { setTimeout(fn, ms); },
    private readonly windowMs = 50,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  update(props: Record<string, string>): void {
    for (const [k, v] of Object.entries(props)) this.desired.set(k, v);
    if (this.scheduled || this.dirtyKeys().length === 0) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      this.flush().catch(this.onError);
    }, this.windowMs);
  }

  // Forget what the panel has; next update/flush repaints everything (panel rebooted or reconnected).
  reset(): void {
    this.sent.clear();
  }

  async flush(): Promise<void> {
    const dirty = this.dirtyKeys();
    for (let i = 0; i < dirty.length; i += MAX_BATCH) {
      const keys = dirty.slice(i, i + MAX_BATCH);
      const values = keys.map((k) => this.desired.get(k) as string);
      await this.send(keys, values);
      keys.forEach((k, j) => this.sent.set(k, values[j]));
    }
  }

  private dirtyKeys(): string[] {
    return [...this.desired].filter(([k, v]) => this.sent.get(k) !== v).map(([k]) => k);
  }
}
```

- [ ] **Step 4: Run tests** — `bun test tests/PanelRenderer.test.ts` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/panel/PanelRenderer.ts tests/PanelRenderer.test.ts
git commit -m "feat: diffing, batching panel renderer"
```

---

### Task 8: Panel connection

**Files:**
- Create: `lib/panel/serviceArgs.ts`, `lib/panel/uiEvents.ts`, `lib/panel/PanelConnection.ts`, `tests/serviceArgs.test.ts`, `tests/uiEvents.test.ts`

**Interfaces:**
- Consumes: the firmware contract from Task 2.
- Produces:
  - `interface ServiceDef { name: string; key: number; argsList: Array<{ name: string; type: number }> }`
  - `toServiceArgs(def: ServiceDef, args: Record<string, unknown>): Array<{ type: number; value: unknown }>`
  - `type UiEvent = { type: 'touch'; page: string; component: string; action: string } | { type: 'page'; page: string } | { type: 'hw_button'; button: 'left' | 'right'; action: 'short' | 'long' }`
  - `parseUiEvent(msg: { service?: string; isEvent?: boolean; dataList?: Array<{ key: string; value: string }> }): UiEvent | null`
  - `class PanelConnection extends EventEmitter` with `constructor(opts: { host: string; port: number; encryptionKey: string; log: (...a: unknown[]) => void; error: (...a: unknown[]) => void })`, `start(): void`, `stop(): void`, `get connected(): boolean`, `call(name: string, args?: Record<string, unknown>): Promise<void>`. Events: `'ready'`, `'disconnected'`, `'ui'` (UiEvent), `'sensor'` (`{ name: string; value: unknown }`).

- [ ] **Step 1: Write the failing tests**

`tests/serviceArgs.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { toServiceArgs } from '../lib/panel/serviceArgs';

const def = {
  name: 'demo', key: 1,
  argsList: [
    { name: 'flag', type: 0 }, { name: 'n', type: 1 }, { name: 'f', type: 2 }, { name: 's', type: 3 }, { name: 'list', type: 7 },
  ],
};

describe('toServiceArgs', () => {
  test('orders and coerces per definition', () => {
    expect(toServiceArgs(def, { list: [1, 'b'], s: 5, f: '1.5', n: 2.9, flag: 1 })).toEqual([
      { type: 0, value: true }, { type: 1, value: 2 }, { type: 2, value: 1.5 }, { type: 3, value: '5' }, { type: 7, value: ['1', 'b'] },
    ]);
  });

  test('throws on missing argument', () => {
    expect(() => toServiceArgs(def, { flag: true })).toThrow("Missing argument 'n' for demo");
  });
});
```

`tests/uiEvents.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseUiEvent } from '../lib/panel/uiEvents';

const ev = (data: Record<string, string>) => ({
  service: 'esphome.nspanel_ui', isEvent: true, dataList: Object.entries(data).map(([key, value]) => ({ key, value })),
});

describe('parseUiEvent', () => {
  test('touch', () => {
    expect(parseUiEvent(ev({ type: 'touch', page: 'home', slot: 'chip01', value: 'short_click' })))
      .toEqual({ type: 'touch', page: 'home', component: 'chip01', action: 'short_click' });
  });
  test('page', () => {
    expect(parseUiEvent(ev({ type: 'page', page: 'climate', slot: '', value: '' }))).toEqual({ type: 'page', page: 'climate' });
  });
  test('hw_button', () => {
    expect(parseUiEvent(ev({ type: 'hw_button', page: '', slot: 'right', value: 'long' })))
      .toEqual({ type: 'hw_button', button: 'right', action: 'long' });
  });
  test('ignores other events, service calls and bad payloads', () => {
    expect(parseUiEvent({ ...ev({ type: 'page', page: 'home' }), service: 'esphome.other' })).toBeNull();
    expect(parseUiEvent({ ...ev({ type: 'page', page: 'home' }), isEvent: false })).toBeNull();
    expect(parseUiEvent(ev({ type: 'hw_button', slot: 'middle', value: 'short' }))).toBeNull();
    expect(parseUiEvent(ev({ type: 'nope' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test tests/serviceArgs.test.ts tests/uiEvents.test.ts` → FAIL.

- [ ] **Step 3: Implement the pure helpers**

`lib/panel/serviceArgs.ts`:

```ts
export interface ServiceDef { name: string; key: number; argsList: Array<{ name: string; type: number }> }

// ESPHome ServiceArgType: 0 bool, 1 int, 2 float, 3 string, 4 bool[], 5 int[], 6 float[], 7 string[]
export function toServiceArgs(def: ServiceDef, args: Record<string, unknown>): Array<{ type: number; value: unknown }> {
  return def.argsList.map(({ name, type }) => {
    if (!(name in args)) throw new Error(`Missing argument '${name}' for ${def.name}`);
    const v = args[name];
    const list = (): unknown[] => (Array.isArray(v) ? v : []);
    switch (type) {
      case 0: return { type, value: Boolean(v) };
      case 1: return { type, value: Math.trunc(Number(v)) };
      case 2: return { type, value: Number(v) };
      case 3: return { type, value: String(v) };
      case 4: return { type, value: list().map(Boolean) };
      case 5: return { type, value: list().map((x) => Math.trunc(Number(x))) };
      case 6: return { type, value: list().map(Number) };
      case 7: return { type, value: list().map(String) };
      default: throw new Error(`Unsupported argument type ${type} for ${def.name}.${name}`);
    }
  });
}
```

`lib/panel/uiEvents.ts`:

```ts
export type UiEvent =
  | { type: 'touch'; page: string; component: string; action: string }
  | { type: 'page'; page: string }
  | { type: 'hw_button'; button: 'left' | 'right'; action: 'short' | 'long' };

export interface HaActionMessage { service?: string; isEvent?: boolean; dataList?: Array<{ key: string; value: string }> }

export const UI_EVENT_NAME = 'esphome.nspanel_ui';

export function parseUiEvent(msg: HaActionMessage): UiEvent | null {
  if (!msg.isEvent || msg.service !== UI_EVENT_NAME) return null;
  const d: Record<string, string> = {};
  for (const { key, value } of msg.dataList ?? []) d[key] = value;
  switch (d.type) {
    case 'touch': return { type: 'touch', page: d.page ?? '', component: d.slot ?? '', action: d.value ?? '' };
    case 'page': return d.page ? { type: 'page', page: d.page } : null;
    case 'hw_button':
      if ((d.slot === 'left' || d.slot === 'right') && (d.value === 'short' || d.value === 'long')) {
        return { type: 'hw_button', button: d.slot, action: d.value };
      }
      return null;
    default: return null;
  }
}
```

- [ ] **Step 4: Run tests** — `bun test tests/serviceArgs.test.ts tests/uiEvents.test.ts` → all pass.

- [ ] **Step 5: Implement `lib/panel/PanelConnection.ts`**

This is a thin wrapper around the library and isn't unit-tested. Task 12 verifies it on the real panel.

```ts
import { EventEmitter } from 'events';
import { ServiceDef, toServiceArgs } from './serviceArgs';
import { HaActionMessage, parseUiEvent } from './uiEvents';

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { Client } = require('@2colors/esphome-native-api');
const { pb } = require('@2colors/esphome-native-api/lib/utils/messages');

export interface PanelConnectionOptions {
  host: string;
  port: number;
  encryptionKey: string;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Events: 'ready' (services discovered, HA events subscribed), 'disconnected', 'ui' (UiEvent),
// 'sensor' ({ name, value }) for every entity state the panel publishes.
export class PanelConnection extends EventEmitter {
  private client: any = null;
  private readonly services = new Map<string, ServiceDef>();

  constructor(private readonly opts: PanelConnectionOptions) {
    super();
  }

  get connected(): boolean {
    return Boolean(this.client?.connected);
  }

  start(): void {
    this.stop();
    const client = new Client({
      host: this.opts.host,
      port: this.opts.port || 6053,
      encryptionKey: this.opts.encryptionKey || '',
      reconnect: true,
      reconnectInterval: 5000,
      pingInterval: 15000,
      pingAttempts: 3,
    });
    const conn = client.connection;

    conn.on('message.ListEntitiesServicesResponse', (def: ServiceDef) => this.services.set(def.name, def));
    conn.on('message.HomeassistantActionRequest', (msg: HaActionMessage) => {
      const ev = parseUiEvent(msg);
      if (ev) this.emit('ui', ev);
    });

    client.on('initialized', () => {
      conn.sendMessage(new pb.SubscribeHomeassistantServicesRequest());
      this.opts.log(`Panel ready; actions: ${[...this.services.keys()].join(', ')}`);
      this.emit('ready');
    });
    client.on('disconnected', () => {
      this.services.clear();
      this.emit('disconnected');
    });
    client.on('newEntity', (entity: any) => {
      entity.on('state', (state: { state: unknown; missingState?: boolean }) => {
        if (!state.missingState) this.emit('sensor', { name: entity.config?.name ?? '', value: state.state });
      });
    });
    client.on('error', (err: Error) => this.opts.error('Panel connection error:', err?.message ?? err));

    this.client = client;
    client.connect();
  }

  stop(): void {
    if (!this.client) return;
    this.client.connection.reconnect = false;
    try {
      this.client.disconnect();
    } catch (err) {
      this.opts.error('Disconnect failed:', err);
    }
    this.client = null;
    this.services.clear();
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<void> {
    const def = this.services.get(name);
    if (!this.client?.connected || !def) throw new Error(`Panel not ready for '${name}'`);
    this.client.connection.executeServiceService({ key: def.key, args: toServiceArgs(def, args) });
  }
}
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
```

- [ ] **Step 6: Commit**

```bash
git add lib/panel/serviceArgs.ts lib/panel/uiEvents.ts lib/panel/PanelConnection.ts tests/serviceArgs.test.ts tests/uiEvents.test.ts
git commit -m "feat: panel connection over ESPHome native API with typed actions and UI events"
```

---

### Task 9: Capability source

**Files:**
- Create: `lib/sources/CapabilitySource.ts`, `tests/CapabilitySource.test.ts`

**Interfaces:**
- Consumes: `CapabilityRef`, `capKey` (Task 3).
- Produces:
  - `interface CapabilityInstance { destroy(): void }`
  - `interface WatchableDevice { capabilitiesObj?: Record<string, { value?: unknown }> | null; makeCapabilityInstance(capabilityId: string, listener: (value: unknown) => void): CapabilityInstance }`
  - `interface DeviceProvider { getDevice(deviceId: string): Promise<WatchableDevice> }`
  - `class CapabilitySource { constructor(devices: DeviceProvider, onChange: () => void, error?: (...a: unknown[]) => void); readonly values: Map<string, unknown>; watch(refs: CapabilityRef[]): Promise<void>; destroy(): void }`

- [ ] **Step 1: Write the failing tests** — `tests/CapabilitySource.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { CapabilitySource, DeviceProvider } from '../lib/sources/CapabilitySource';

function fakeHomey(initial: Record<string, Record<string, unknown>>) {
  const listeners = new Map<string, (v: unknown) => void>();
  let destroyed: string[] = [];
  const missing = new Set<string>();
  const provider: DeviceProvider = {
    async getDevice(id) {
      if (missing.has(id) || !initial[id]) throw new Error(`device ${id} not found`);
      return {
        capabilitiesObj: Object.fromEntries(Object.entries(initial[id]).map(([c, value]) => [c, { value }])),
        makeCapabilityInstance(cap, listener) {
          listeners.set(`${id}:${cap}`, listener);
          return { destroy: () => { destroyed.push(`${id}:${cap}`); } };
        },
      };
    },
  };
  return { provider, listeners, missing, destroyed: () => destroyed, reset: () => { destroyed = []; } };
}

describe('CapabilitySource', () => {
  test('loads initial values and reports live changes', async () => {
    const h = fakeHomey({ d: { onoff: true } });
    let changes = 0;
    const s = new CapabilitySource(h.provider, () => { changes++; });
    await s.watch([{ deviceId: 'd', capability: 'onoff' }]);
    expect(s.values.get('d:onoff')).toBe(true);
    expect(changes).toBe(1);
    h.listeners.get('d:onoff')!(false);
    expect(s.values.get('d:onoff')).toBe(false);
    expect(changes).toBe(2);
  });

  test('unwatches removed refs and keeps existing ones', async () => {
    const h = fakeHomey({ d: { onoff: true, dim: 0.5 } });
    const s = new CapabilitySource(h.provider, () => {});
    await s.watch([{ deviceId: 'd', capability: 'onoff' }, { deviceId: 'd', capability: 'dim' }]);
    await s.watch([{ deviceId: 'd', capability: 'dim' }]);
    expect(h.destroyed()).toEqual(['d:onoff']);
    expect(s.values.has('d:onoff')).toBe(false);
    expect(s.values.get('d:dim')).toBe(0.5);
  });

  test('missing device yields null without breaking others, and is retried later', async () => {
    const h = fakeHomey({ ok: { onoff: true }, flaky: { onoff: true } });
    h.missing.add('flaky');
    const errors: unknown[] = [];
    const s = new CapabilitySource(h.provider, () => {}, (...a) => errors.push(a));
    const refs = [{ deviceId: 'flaky', capability: 'onoff' }, { deviceId: 'ok', capability: 'onoff' }];
    await s.watch(refs);
    expect(s.values.get('flaky:onoff')).toBeNull();
    expect(s.values.get('ok:onoff')).toBe(true);
    expect(errors).toHaveLength(1);
    h.missing.delete('flaky');
    await s.watch(refs);
    expect(s.values.get('flaky:onoff')).toBe(true);
  });

  test('destroy releases all instances', async () => {
    const h = fakeHomey({ d: { onoff: true } });
    const s = new CapabilitySource(h.provider, () => {});
    await s.watch([{ deviceId: 'd', capability: 'onoff' }]);
    s.destroy();
    expect(h.destroyed()).toEqual(['d:onoff']);
    expect(s.values.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test tests/CapabilitySource.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/sources/CapabilitySource.ts`**

```ts
import { CapabilityRef, capKey } from '../config';

export interface CapabilityInstance { destroy(): void }

export interface WatchableDevice {
  capabilitiesObj?: Record<string, { value?: unknown }> | null;
  makeCapabilityInstance(capabilityId: string, listener: (value: unknown) => void): CapabilityInstance;
}

export interface DeviceProvider { getDevice(deviceId: string): Promise<WatchableDevice> }

// Live view of the capability values the dashboard shows. Failed refs are stored as null and
// retried on the next watch() call.
export class CapabilitySource {
  readonly values = new Map<string, unknown>();
  private readonly instances = new Map<string, CapabilityInstance>();

  constructor(
    private readonly devices: DeviceProvider,
    private readonly onChange: () => void,
    private readonly error: (...args: unknown[]) => void = () => {},
  ) {}

  async watch(refs: CapabilityRef[]): Promise<void> {
    const wanted = new Map(refs.map((r) => [capKey(r.deviceId, r.capability), r]));

    for (const [key, instance] of this.instances) {
      if (wanted.has(key)) continue;
      instance.destroy();
      this.instances.delete(key);
    }
    for (const key of [...this.values.keys()]) if (!wanted.has(key)) this.values.delete(key);

    let changed = false;
    for (const [key, ref] of wanted) {
      if (this.instances.has(key)) continue;
      try {
        const device = await this.devices.getDevice(ref.deviceId);
        this.values.set(key, device.capabilitiesObj?.[ref.capability]?.value ?? null);
        this.instances.set(key, device.makeCapabilityInstance(ref.capability, (value) => {
          this.values.set(key, value);
          this.onChange();
        }));
      } catch (err) {
        this.error(`Cannot watch ${key}:`, err);
        this.values.set(key, null);
      }
      changed = true;
    }
    if (changed) this.onChange();
  }

  destroy(): void {
    for (const instance of this.instances.values()) instance.destroy();
    this.instances.clear();
    this.values.clear();
  }
}
```

- [ ] **Step 4: Run tests** — `bun test tests/CapabilitySource.test.ts` → all pass. Then `bun test` → every suite passes.

- [ ] **Step 5: Commit**

```bash
git add lib/sources/CapabilitySource.ts tests/CapabilitySource.test.ts
git commit -m "feat: live capability subscriptions via makeCapabilityInstance"
```

---

### Task 10: Device and driver wiring; remove legacy code

**Files:**
- Rewrite: `drivers/nspanel/device.ts`, `drivers/nspanel/driver.ts`
- Modify: `.homeycompose/app.json` (name and description), `drivers/nspanel/driver.compose.json` (capabilities, language setting), `.homeycompose/flow/actions/goto_page.json`
- Delete: `lib/ESPHomeClient.ts`, `scripts/patch-esphome-api.js`, `types/esphome-native-api.d.ts`, `.homeycompose/capabilities/nspanel_version_blueprint.json`, `.homeycompose/capabilities/nspanel_brightness.json`, `.homeycompose/flow/actions/update_button.json`, `.homeycompose/flow/actions/update_home_entity.json`, `.homeycompose/flow/actions/update_weather.json`, `.homeycompose/flow/actions/show_qrcode.json`, `.homeycompose/flow/triggers/button_pressed.json`

**Interfaces:**
- Consumes: everything from Tasks 3–9.
- Produces (used by `api.ts` in Task 11): `NSPanelDevice#onConfigUpdated(): Promise<void>`. The config lives in the device store key `dashboardConfig`.

- [ ] **Step 1: Delete the legacy files**

```bash
git rm -q lib/ESPHomeClient.ts scripts/patch-esphome-api.js types/esphome-native-api.d.ts \
  .homeycompose/capabilities/nspanel_version_blueprint.json .homeycompose/capabilities/nspanel_brightness.json \
  .homeycompose/flow/actions/update_button.json .homeycompose/flow/actions/update_home_entity.json \
  .homeycompose/flow/actions/update_weather.json .homeycompose/flow/actions/show_qrcode.json \
  .homeycompose/flow/triggers/button_pressed.json
```

- [ ] **Step 2: Update the compose JSON**

In `drivers/nspanel/driver.compose.json`, remove `"nspanel_brightness"` and `"nspanel_version_blueprint"` from `capabilities` and from `capabilitiesOptions` (if they appear there). In the settings group that holds `dateFormat`, add this as the first entry:

```json
        {
          "id": "language",
          "type": "dropdown",
          "label": { "en": "Panel language" },
          "value": "nl",
          "values": [
            { "id": "nl", "label": { "en": "Nederlands" } },
            { "id": "en", "label": { "en": "English" } }
          ]
        },
```

In `.homeycompose/flow/actions/goto_page.json`, replace the `values` array with:

```json
      "values": [
        { "id": "home", "label": { "en": "Home" } },
        { "id": "weather01", "label": { "en": "Weather" } },
        { "id": "climate", "label": { "en": "Climate" } },
        { "id": "settings", "label": { "en": "Settings" } }
      ]
```

In `.homeycompose/app.json`, set `"name": { "en": "NSPanel for Homey" }` and `"description": { "en": "Fast, configurable Homey dashboard for the Sonoff NSPanel." }`.

- [ ] **Step 3: Rewrite `drivers/nspanel/driver.ts`**

Keep `onPairListDevices` and the `PairDevice` interface exactly as they are now (lines 5–16 and 104–132 of the current file). Replace the class body before `onPairListDevices`, and the trailing `NSPanelDevice` interface, with:

```ts
class NSPanelDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('NSPanel driver initialized');

    this.homey.flow.getDeviceTriggerCard('physical_button_pressed')
      .registerRunListener(async (args, state) => (args.button === 'any' || args.button === state.button)
        && (args.action === 'any' || args.action === state.action));

    const action = (id: string, run: (device: NSPanelDevice, args: Record<string, any>) => Promise<void>): void => {
      this.homey.flow.getActionCard(id).registerRunListener(async (args) => run(args.device as NSPanelDevice, args));
    };
    action('show_notification', (d, a) => d.showNotification(a.heading, a.message, a.timeout || 10));
    action('clear_notification', (d) => d.clearNotification());
    action('wake_up', (d) => d.wakeUp());
    action('play_sound', (d, a) => d.playSound(a.melody));
    action('goto_page', (d, a) => d.gotoPage(a.page));
  }
```

and at the bottom:

```ts
interface NSPanelDevice extends Homey.Device {
  showNotification(heading: string, message: string, timeout: number): Promise<void>;
  clearNotification(): Promise<void>;
  wakeUp(): Promise<void>;
  playSound(melody: string): Promise<void>;
  gotoPage(page: string): Promise<void>;
}

module.exports = NSPanelDriver;
```

Add `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top of the file, after `'use strict';`.

- [ ] **Step 4: Rewrite `drivers/nspanel/device.ts`**

```ts
'use strict';

import Homey from 'homey';
import { DashboardConfig, loadConfig, watchedCapabilities } from '../../lib/config';
import { formatDate, toLang } from '../../lib/i18n';
import { buildHomeProps } from '../../lib/panel/homeView';
import { PanelConnection } from '../../lib/panel/PanelConnection';
import { PanelRenderer } from '../../lib/panel/PanelRenderer';
import { UiEvent } from '../../lib/panel/uiEvents';
import { CapabilitySource, DeviceProvider } from '../../lib/sources/CapabilitySource';
import { WeatherNow, fetchWeather } from '../../lib/weather';

const WEATHER_INTERVAL_MS = 30 * 60 * 1000;
const RENDER_TICK_MS = 60 * 1000; // keeps the date line current; unchanged values are not resent

const SENSOR_CAPABILITIES: Record<string, string> = {
  RSSI: 'nspanel_rssi',
  'Current page': 'nspanel_page',
  'Version TFT': 'nspanel_version_tft',
  'Version ESPHome': 'nspanel_version_esphome',
};

class NSPanelDevice extends Homey.Device {
  private panel!: PanelConnection;
  private renderer!: PanelRenderer;
  private capabilities: CapabilitySource | null = null;
  private config!: DashboardConfig;
  private weather: WeatherNow | null = null;
  private panelTemperature: number | null = null;
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;
  private intervals: Array<ReturnType<typeof setInterval>> = [];

  async onInit(): Promise<void> {
    for (const cap of ['nspanel_version_blueprint', 'nspanel_brightness']) {
      if (this.hasCapability(cap)) await this.removeCapability(cap).catch(this.error);
    }

    this.config = this.readConfig();
    this.renderer = new PanelRenderer(
      (keys, values) => this.panel.call('set_props', { keys, values }),
      (fn, ms) => { this.homey.setTimeout(fn, ms); },
      50,
      (err) => this.error('Render failed:', err),
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { HomeyAPI } = require('homey-api');
      const api = await HomeyAPI.createAppAPI({ homey: this.homey });
      const provider: DeviceProvider = { getDevice: (id) => api.devices.getDevice({ id }) };
      this.capabilities = new CapabilitySource(provider, () => this.render(), (...a) => this.error(...a));
    } catch (err) {
      this.error('homey-api unavailable; device values will not be shown:', err);
    }

    this.registerCapabilityListener('onoff', async (value: boolean) => {
      await this.panel.call('set_brightness', { brightness: value ? 100 : 0 });
    });

    this.connect();
    this.intervals.push(
      this.homey.setInterval(() => this.refreshWeather().catch(this.error), WEATHER_INTERVAL_MS),
      this.homey.setInterval(() => this.render(), RENDER_TICK_MS),
    );
    this.refreshWeather().catch(this.error);
  }

  private readConfig(): DashboardConfig {
    return loadConfig({
      dashboardConfig: this.getStoreValue('dashboardConfig'),
      nspanelConfig: this.getStoreValue('nspanelConfig'),
    });
  }

  private connect(): void {
    this.panel?.stop();
    const s = this.getSettings();
    if (!s.host) {
      this.setUnavailable('No host configured').catch(this.error);
      return;
    }
    this.panel = new PanelConnection({
      host: s.host,
      port: s.port,
      encryptionKey: s.encryptionKey,
      log: (...a) => this.log(...a),
      error: (...a) => this.error(...a),
    });
    this.panel.on('ready', () => this.onPanelReady().catch(this.error));
    this.panel.on('disconnected', () => this.setUnavailable('Disconnected from panel').catch(this.error));
    this.panel.on('ui', (ev: UiEvent) => this.onUiEvent(ev));
    this.panel.on('sensor', (s2: { name: string; value: unknown }) => this.onSensor(s2.name, s2.value));
    this.panel.start();
  }

  private async onPanelReady(): Promise<void> {
    await this.setAvailable();
    await this.setCapabilityValue('onoff', true).catch(this.error);
    await this.pushPanelSettings();
    await this.capabilities?.watch(watchedCapabilities(this.config));
    this.renderer.reset(); // panel may have rebooted: its cache is empty
    this.render();
  }

  private async pushPanelSettings(): Promise<void> {
    const s = this.getSettings();
    await this.panel.call('set_clock_format', { h24: s.timeFormat !== 'h:mm A' });
    await this.panel.call('set_button_mode', { button: 'left', relay: this.config.buttons.left === 'relay' });
    await this.panel.call('set_button_mode', { button: 'right', relay: this.config.buttons.right === 'relay' });
  }

  private render(): void {
    if (!this.panel?.connected) return;
    const s = this.getSettings();
    const lang = toLang(s.language);
    this.renderer.update(buildHomeProps(this.config, {
      lang,
      dateText: formatDate(new Date(), s.dateFormat || 'ddd DD MMM', lang, this.homey.clock.getTimezone()),
      values: this.capabilities?.values ?? new Map(),
      weather: s.weatherEnabled === false ? null : this.weather,
      panelTemperature: this.panelTemperature,
    }));
  }

  private async refreshWeather(): Promise<void> {
    if (this.getSettings().weatherEnabled === false) return;
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    this.weather = await fetchWeather(lat, lon);
    this.render();
  }

  private onSensor(name: string, value: unknown): void {
    if (name === 'Temperature' && typeof value === 'number') {
      this.panelTemperature = value;
      this.setCapabilityValue('measure_temperature', value).catch(this.error);
      this.render();
      return;
    }
    const cap = SENSOR_CAPABILITIES[name];
    if (cap && this.hasCapability(cap)) this.setCapabilityValue(cap, value).catch(this.error);
  }

  private onUiEvent(ev: UiEvent): void {
    this.log('UI event:', JSON.stringify(ev));
    if (ev.type === 'hw_button') {
      const state = { button: ev.button, action: ev.action === 'long' ? 'long_click' : 'short_click' };
      this.homey.flow.getDeviceTriggerCard('physical_button_pressed').trigger(this, state, state).catch(this.error);
    }
  }

  async onConfigUpdated(): Promise<void> {
    this.config = this.readConfig();
    if (!this.panel?.connected) return;
    await this.pushPanelSettings();
    await this.capabilities?.watch(watchedCapabilities(this.config));
    this.render();
  }

  async showNotification(heading: string, message: string, timeout: number): Promise<void> {
    await this.panel.call('set_props', {
      keys: ['notification.notifi_label.txt', 'notification.notifi_text01.txt'],
      values: [heading, message],
    });
    await this.panel.call('goto_page', { page: 'notification' });
    if (this.notificationTimer) this.homey.clearTimeout(this.notificationTimer);
    if (timeout > 0) {
      this.notificationTimer = this.homey.setTimeout(() => this.clearNotification().catch(this.error), timeout * 1000);
    }
  }

  async clearNotification(): Promise<void> {
    if (this.notificationTimer) this.homey.clearTimeout(this.notificationTimer);
    this.notificationTimer = null;
    await this.panel.call('goto_page', { page: 'home' });
  }

  async wakeUp(): Promise<void> {
    await this.panel.call('set_brightness', { brightness: 100 });
  }

  async playSound(melody: string): Promise<void> {
    await this.panel.call('play_rtttl', { tone: melody });
  }

  async gotoPage(page: string): Promise<void> {
    await this.panel.call('goto_page', { page });
  }

  async onSettings({ changedKeys }: { changedKeys: string[] }): Promise<void> {
    if (['host', 'port', 'encryptionKey'].some((k) => changedKeys.includes(k))) {
      this.homey.setTimeout(() => this.connect(), 0); // settings are applied after onSettings resolves
      return;
    }
    if (changedKeys.includes('timeFormat')) this.homey.setTimeout(() => this.pushPanelSettings().catch(this.error), 0);
    if (changedKeys.includes('weatherEnabled')) this.homey.setTimeout(() => this.refreshWeather().catch(this.error), 0);
    this.homey.setTimeout(() => this.render(), 0);
  }

  async onUninit(): Promise<void> {
    this.teardown();
  }

  async onDeleted(): Promise<void> {
    this.teardown();
  }

  private teardown(): void {
    this.intervals.forEach((i) => this.homey.clearInterval(i));
    this.intervals = [];
    this.capabilities?.destroy();
    this.panel?.stop();
  }
}

module.exports = NSPanelDevice;
```

The old driver also had `password` in device settings. The new firmware uses encryption only, so leave that setting in place but unused.

- [ ] **Step 5: Type-check, lint, test, validate**

```bash
bunx tsc --noEmit
bun run lint
bun test
bunx homey app validate --level debug
```

Expected: all four succeed. `homey app validate` regenerates `app.json` from `.homeycompose`, and it must not reference deleted cards or capabilities. Fix any type errors in `device.ts` and `driver.ts` without changing the `lib/` interfaces.

- [ ] **Step 6: Commit**

```bash
git add -A drivers .homeycompose app.json
git commit -m "feat: wire live home page; drop polling, HA-event hacks and dead flow cards"
```

---

### Task 11: Settings API and settings page

**Files:**
- Rewrite: `api.ts`, `settings/index.html`
- Modify: `.homeycompose/app.json` (`api` section)

**Interfaces:**
- Consumes: `normalizeConfig`, `loadConfig` (Task 3); `NSPanelDevice#onConfigUpdated` (Task 10); `lib/icons.json`.
- Produces HTTP endpoints for the settings page:
  - `GET /devices` → `Record<id, { id, name, zoneName, driverId, capabilities: string[], capabilitiesObj }>`
  - `GET /icons` → `Record<name, glyph>`
  - `GET /config/:deviceId` → `DashboardConfig`
  - `PUT /config/:deviceId` (body: any) → `DashboardConfig` (normalized, saved)

- [ ] **Step 1: Replace the `api` section in `.homeycompose/app.json`**

```json
  "api": {
    "getDevices": { "method": "GET", "path": "/devices" },
    "getIcons": { "method": "GET", "path": "/icons" },
    "getConfig": { "method": "GET", "path": "/config/:deviceId" },
    "putConfig": { "method": "PUT", "path": "/config/:deviceId" }
  }
```

- [ ] **Step 2: Rewrite `api.ts`**

```ts
'use strict';

import { DashboardConfig, loadConfig, normalizeConfig } from './lib/config';
import icons from './lib/icons.json';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */

function findPanel(homey: any, deviceId: string): any {
  const device = homey.drivers.getDriver('nspanel').getDevices().find((d: any) => d.getData().id === deviceId);
  if (!device) throw new Error(`NSPanel ${deviceId} not found`);
  return device;
}

module.exports = {
  async getDevices({ homey }: { homey: any }): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const device of homey.drivers.getDriver('nspanel').getDevices()) {
      const id = device.getData().id;
      result[id] = { id, name: device.getName(), zoneName: '', driverId: 'nspanel', capabilities: [], capabilitiesObj: {} };
    }
    const { HomeyAPI } = require('homey-api');
    const api = await HomeyAPI.createAppAPI({ homey });
    const [zones, devices] = await Promise.all([api.zones.getZones(), api.devices.getDevices()]);
    for (const [id, d] of Object.entries(devices) as [string, any][]) {
      if (result[id]) continue;
      result[id] = {
        id,
        name: d.name,
        zoneName: zones[d.zone]?.name ?? '',
        driverId: d.driverId,
        capabilities: d.capabilities ?? [],
        capabilitiesObj: Object.fromEntries(Object.entries(d.capabilitiesObj ?? {})
          .map(([c, o]: [string, any]) => [c, { title: o?.title ?? c, units: o?.units ?? '' }])),
      };
    }
    return result;
  },

  async getIcons(): Promise<Record<string, string>> {
    return icons;
  },

  async getConfig({ homey, params }: { homey: any; params: { deviceId: string } }): Promise<DashboardConfig> {
    const device = findPanel(homey, params.deviceId);
    return loadConfig({ dashboardConfig: device.getStoreValue('dashboardConfig'), nspanelConfig: device.getStoreValue('nspanelConfig') });
  },

  async putConfig({ homey, params, body }: { homey: any; params: { deviceId: string }; body: unknown }): Promise<DashboardConfig> {
    const device = findPanel(homey, params.deviceId);
    const config = normalizeConfig(body);
    await device.setStoreValue('dashboardConfig', config);
    await device.onConfigUpdated();
    return config;
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
```

- [ ] **Step 3: Rewrite `settings/index.html`**

This is a compact single page. Phase 6 replaces it with the tabbed UI.

```html
<!doctype html>
<html>
<head>
  <script type="text/javascript" src="/homey.js" data-origin="settings"></script>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 12px; }
    fieldset { border: 1px solid #ddd; border-radius: 8px; margin: 0 0 12px; padding: 10px; }
    legend { font-weight: 600; }
    .slot { display: grid; grid-template-columns: 1.4fr 1.2fr 0.8fr 0.6fr; gap: 6px; margin-bottom: 6px; }
    .slot.chip { grid-template-columns: 1.4fr 1.2fr 0.8fr; }
    select, input { width: 100%; box-sizing: border-box; padding: 4px; }
    #status { margin-top: 8px; }
    .error { color: #c00; }
  </style>
</head>
<body>
  <h1>NSPanel</h1>
  <p><select id="panel"></select></p>
  <div id="form" hidden>
    <fieldset><legend>Thermostat</legend><select id="thermostat"></select></fieldset>
    <fieldset><legend>Chips (icon shown while active)</legend><div id="chips"></div></fieldset>
    <fieldset><legend>Values</legend><div id="values"></div></fieldset>
    <fieldset><legend>Physical buttons</legend>
      <label>Left <select id="btn-left"><option value="relay">Toggle relay</option><option value="event">Event only</option></select></label>
      <label>Right <select id="btn-right"><option value="relay">Toggle relay</option><option value="event">Event only</option></select></label>
    </fieldset>
    <button id="save" class="hy-button-primary">Save</button>
    <div id="status"></div>
  </div>
  <datalist id="icon-names"></datalist>

  <script>
    const CHIPS = 7, VALUES = 4;
    let H, devices = {}, icons = {}, glyphToName = {};

    const api = (method, path, body) => new Promise((ok, fail) => H.api(method, path, body ?? null, (e, r) => e ? fail(e) : ok(r)));
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function deviceOptions(filter) {
      const list = Object.values(devices).filter((d) => d.driverId !== 'nspanel' && (!filter || filter(d)))
        .sort((a, b) => (a.zoneName + a.name).localeCompare(b.zoneName + b.name));
      return '<option value="">—</option>' + list.map((d) => `<option value="${esc(d.id)}">${esc(d.zoneName ? d.zoneName + ' · ' : '')}${esc(d.name)}</option>`).join('');
    }

    function capOptions(deviceId, selected) {
      const d = devices[deviceId];
      if (!d) return '<option value="">—</option>';
      return '<option value="">—</option>' + d.capabilities.map((c) =>
        `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(d.capabilitiesObj[c]?.title || c)}</option>`).join('');
    }

    function slotRow(kind, i, slot) {
      const row = document.createElement('div');
      row.className = `slot ${kind}`;
      row.innerHTML = `
        <select data-k="deviceId">${deviceOptions()}</select>
        <select data-k="capability"></select>
        <input data-k="icon" list="icon-names" placeholder="icon name">
        ${kind === 'value' ? '<input data-k="unit" placeholder="unit">' : ''}`;
      const [dev, cap, icon] = row.querySelectorAll('select, input');
      dev.value = slot?.deviceId ?? '';
      cap.innerHTML = capOptions(dev.value, slot?.capability);
      dev.onchange = () => { cap.innerHTML = capOptions(dev.value, ''); };
      icon.value = slot ? (glyphToName[slot.icon] ?? '') : '';
      if (kind === 'value') row.querySelector('[data-k=unit]').value = slot?.unit ?? '';
      return row;
    }

    function readSlots(containerId) {
      return [...document.getElementById(containerId).children].map((row) => {
        const get = (k) => row.querySelector(`[data-k=${k}]`)?.value ?? '';
        if (!get('deviceId') || !get('capability')) return null;
        return { deviceId: get('deviceId'), capability: get('capability'), icon: icons[get('icon')] ?? '', unit: get('unit') };
      });
    }

    async function loadPanel(id) {
      const cfg = await api('GET', `/config/${encodeURIComponent(id)}`);
      const thermo = document.getElementById('thermostat');
      thermo.innerHTML = deviceOptions((d) => d.capabilities.includes('target_temperature'));
      thermo.value = cfg.home.thermostat?.deviceId ?? '';
      const chips = document.getElementById('chips'); chips.innerHTML = '';
      for (let i = 0; i < CHIPS; i++) chips.appendChild(slotRow('chip', i, cfg.home.chips[i]));
      const values = document.getElementById('values'); values.innerHTML = '';
      for (let i = 0; i < VALUES; i++) values.appendChild(slotRow('value', i, cfg.home.values[i]));
      document.getElementById('btn-left').value = cfg.buttons.left;
      document.getElementById('btn-right').value = cfg.buttons.right;
      document.getElementById('form').hidden = false;
    }

    async function save() {
      const status = document.getElementById('status');
      const id = document.getElementById('panel').value;
      const thermostat = document.getElementById('thermostat').value;
      const body = {
        home: {
          thermostat: thermostat ? { deviceId: thermostat } : null,
          chips: readSlots('chips'),
          values: readSlots('values'),
        },
        buttons: { left: document.getElementById('btn-left').value, right: document.getElementById('btn-right').value },
      };
      try {
        await api('PUT', `/config/${encodeURIComponent(id)}`, body);
        status.className = ''; status.textContent = 'Saved.';
      } catch (e) {
        status.className = 'error'; status.textContent = `Save failed: ${e.message || e}`;
      }
    }

    async function onHomeyReady(homey) {
      H = homey;
      H.ready();
      [devices, icons] = await Promise.all([api('GET', '/devices'), api('GET', '/icons')]);
      glyphToName = Object.fromEntries(Object.entries(icons).map(([n, g]) => [g, n]));
      document.getElementById('icon-names').innerHTML = Object.keys(icons).map((n) => `<option value="${n}">`).join('');
      const panels = Object.values(devices).filter((d) => d.driverId === 'nspanel');
      const sel = document.getElementById('panel');
      sel.innerHTML = panels.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
      sel.onchange = () => loadPanel(sel.value);
      document.getElementById('save').onclick = save;
      if (panels.length) await loadPanel(panels[0].id);
      else document.body.insertAdjacentHTML('beforeend', '<p>No NSPanel paired yet.</p>');
    }
  </script>
</body>
</html>
```

- [ ] **Step 4: Verify**

```bash
bunx tsc --noEmit && bun run lint && bun test && bunx homey app validate --level debug
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add api.ts settings/index.html .homeycompose/app.json app.json
git commit -m "feat: config API and compact settings page for the new dashboard config"
```

---

### Task 12: Flash, install and verify on the real panel (with the user)

**Files:**
- Modify: `docs/phase0-findings.md` (append results)

- [ ] **Step 1: Install the app on Homey first**

```bash
bunx homey login   # if needed
bunx homey app install
```

Expected: install succeeds. The panel still runs Blackymas, so the device shows "Panel not ready" errors in the log. That's fine.

- [ ] **Step 2: Flash the firmware over the air**

Make sure `firmware/secrets.yaml` holds the real Wi-Fi credentials, the **same** `api_encryption_key` as the Homey device setting, and the panel's current OTA password. Then:

```bash
esphome upload firmware/nspanel.yaml --device <panel-ip>
esphome logs firmware/nspanel.yaml --device <panel-ip>
```

Expected in the logs: Wi-Fi connected, `Nextion setup`, then (within about 2 s) a localevent `boot,params,1,1,2026041`. The panel leaves the boot screen and shows home.

If OTA is rejected because of the password: stop and follow the serial-flash fallback recorded in Task 1.

- [ ] **Step 3: Manual checklist**

Tick each item with the user and record the results in `docs/phase0-findings.md` under `## Foundation verification`:

1. Home shows the time (SNTP), the date in the selected language, outdoor temperature with a weather picture, and indoor temperature.
2. Configure 2 chips and 2 values in the settings page and save. The panel updates within 1 s, with no reboot.
3. Toggle a configured light in the Homey mobile app. The chip appears or disappears on the panel within 1 s (stopwatch; previously up to 60 s).
4. Switch device setting language nl ↔ en. The date line changes.
5. Left hardware button short press toggles relay 1 and its chip; a long press fires the "Physical button" flow trigger (test with a flow that sends a push notification).
6. Set left button mode to "Event only". A short press no longer toggles the relay but still triggers the flow.
7. Flow card "Show notification" with a heading containing `"quotes"` shows correctly, then returns home after the timeout.
8. Unplug the panel's power for 10 s. After boot, the home page is fully repainted without touching Homey.
9. Restart the app (`bunx homey app install` again). The panel is repainted after reconnect.
10. Turn off Wi-Fi at the router for 1 minute. The relays still toggle with the hardware buttons; the panel reconnects by itself.

- [ ] **Step 4: Commit**

```bash
git add docs/phase0-findings.md
git commit -m "docs: foundation verification results"
```

---

## Deferred to the next plans (not part of this one)

- **TFT fork:** trimmed page set, runtime-settable labels, moods page, calendar page, next-event line, home target temperature.
- **Climate page control** (`target_set` events), forecast page, screensaver and dimming, QR code page.
- **Moods:** ActionRunner, "Tile pressed" trigger. Verify that the `homey.mood.set` and `homey.flow.start` scopes are granted to the app. If they aren't, fall back to the trigger card.
- **Calendar source.**
- **Tabbed settings UI** with a visual icon grid.
