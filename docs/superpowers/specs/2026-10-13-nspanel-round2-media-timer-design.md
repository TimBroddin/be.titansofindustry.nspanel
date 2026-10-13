# NSPanel round 2: safe area, Homey icons, media player and kitchen timer — Design

Date: 2026-10-13
Status: Approved by user (layouts approved in the visual companion; decisions below confirmed one by one)
Builds on: `2026-10-12-nspanel-soft-dark-tft-design.md` (branch `soft-dark`)

## 1. Already done in this round (committed)

- **Safe area:** the EU panel shows only x 0–454 (measured with a calibration pattern). All art and components are scaled from the 18–462 design grid into 14–441 (`fitSafeArea` in `design/layout.ts`).
- **Background:** graphite D (`#141518`, subtle radial gradient), chosen from on-panel swatches; text colours unchanged.
- **Icons:** chips and mood tiles use a generated *NSPanel Homey Icons* font (1,687 icons: athombv/homey-vectors-public plus the icons of all of the user's devices, stable codepoints in `tft/fonts/homey-icons-map.json`). The weather icon stays on Blackymas' MDI font.
- **Calendar:** no runtime font switching; all `tNN` use the body font.

## 2. Decisions for media and timer

| Topic | Decision |
|---|---|
| Media players | Generic: any Homey device with `speaker_*` capabilities. A configured, ordered list; the page shows the one that is playing (first in the list wins), "player ▸" cycles manually. |
| Controls | Previous / play-pause / next, volume −/+ with a level bar, progress bar with position and duration. Unsupported controls are hidden (e.g. Apple TV: no previous/next; volume via up/down, no level bar). |
| Cover art | 96×96, drawn by the firmware as colour strips (spike: complete and recognisable at 32 colours). Device icon until the cover arrives. Blue reduced ×0.85 to counter this LCD's blue cast. Sent in paced batches through a firmware action (the spike showed dropped commands without pacing). Cached in the firmware and redrawn when the page reopens. |
| Timer | One timer, runs in the firmware (works without Homey). +1/+5/+10 min, start/pause/resume, reset. On finish: buzzer, timer page shows "Klaar!" with Stop. Homey: action "Start timer (minutes)", trigger "Timer finished". |
| Home | Five round buttons: moods, climate, media, timer, calendar. An amber line "Timer 04:32" under the date while a timer runs (tap → timer page). The media button shows amber while something plays. |

## 3. Pages

Page ids: existing 0–6 unchanged, new **7 `media`**, **8 `timer`**.

New pictures (appended after the existing 8): `home-on` (home art with the media button amber), `media`, `media-bare` (media art without the previous/next buttons and volume bar track), `timer`.

Show/hide without runtime geometry: components that sit on top of an optional element use `picc` = the normal picture or the variant without that element.

- **home** (changes): `tmr` (amber body text under the date, touch → timer page), `nav_med` (empty text component exactly over the media button; `picc` = `p_home` or `p_home_on`), five nav hotspots.
- **media**: `player` (pill label, touch → next player), cover area 96×96 at the left (not a component; drawn by the firmware), `cover_ic` (device icon centred in the cover area while no cover is drawn), `src` (app · player, muted caps), `track`, `artist`, `prog` (Nextion Progress Bar, amber on dark), `pos`, `dur`, `prev_b` / `pp` / `next_b` (icon text components over the round buttons; `pp` switches play/pause glyph), `vol` (Progress Bar), hotspots for previous, play/pause, next, volume −, volume +.
- **timer**: `remain` (big MM:SS, clock font), `status` (localized "running · ready at 13:47" / "paused" / "Done!"), `act_lbl` and `rst_lbl` (localized pill labels), hotspots +1, +5, +10 min, action (start/pause/resume/stop), reset.

## 4. Protocol additions

TFT → firmware CSV (`page,action,arg`):

| CSV | Handled by |
|---|---|
| `media,toggle,` `media,prev,` `media,next,` `media,vol,-1` `media,vol,1` `media,player,next` | Homey (ActionRunner) |
| `timer,add,60` `timer,add,300` `timer,add,600` `timer,act,` `timer,reset,` | **Firmware** (and forwarded to Homey for information) |

Firmware actions (Homey → firmware):

| Action | Purpose |
|---|---|
| `timer_set(seconds: int, start: bool)` | Flow card "Start timer" |
| `timer_labels(labels: string[])` | Localized strings: running-prefix, paused, done, start, pause, resume, stop, reset, home prefix |
| `cover_begin(id: string)` | Start a new cover (clears the cache, remembers the id) |
| `cover_strips(strips: string[])` | Up to 40 `x,y,w,h,color` rectangles (absolute coordinates); cached and drawn if the media page is visible |
| `cover_clear()` | No cover: forget and stop drawing |

Firmware → Homey events: `timer,finished` (trigger), plus the forwarded timer touches.

## 5. Homey app

- **Config:** `media: { players: string[] }` (ordered device ids).
- **MediaSource** (pure selection logic + capability watching): watches `speaker_playing`, `speaker_track`, `speaker_artist`, `speaker_album`, `speaker_position`, `speaker_duration`, `volume_set`, `volume_mute` of the listed players. Active player = manual choice (kept until another player starts playing), else the first playing player in list order, else the last active one. Position is extrapolated locally each second while playing and the media page is open.
- **mediaView** (pure): props for the media page and `home.nav_med.picc`.
- **Cover pipeline** (pure, testable): decode JPEG/PNG (pure JS) → cover-fit 96×96 (area average) → blue ×0.85 → median-cut 32 colours → horizontal runs merged vertically into rectangles → strips. Sender paces batches (40 strips, ~120 ms apart).
- **ActionRunner:** media actions map to `speaker_playing` toggle, `speaker_prev`/`speaker_next`, `volume_set ± 0.05` (or `volume_up`/`volume_down`), player cycling.
- **Flow cards:** action "Start timer (minutes)", trigger "Timer finished".
- **Settings:** Media section: choose and order players.

## 6. Testing

Pure units with `bun test`: media selection and position extrapolation, mediaView (Sonos and Apple-TV-style capability sets), cover pipeline (resize, colour correction, quantize, strip merging round-trip), timer formatting; firmware timer logic and cover cache via the host-compiled C++ test (as `PropCache`). Layout tests cover the new pages (safe area, no overlaps, unique names). Manual on panel: play/pause/next on Sonos and Apple TV, cover appears within a few seconds, timer finishes with buzzer while Homey is offline.

## 7. Risks

- **Fetching album art from the app** depends on reading another app's device image through `homey-api` with the app's token; verify early. Fallback: no cover, device icon only.
- **Editor work grows** (two pages + home changes); `tft/ROUND2.md` lists every step and component.
