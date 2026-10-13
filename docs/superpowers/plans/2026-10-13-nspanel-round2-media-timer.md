# NSPanel round 2 (media, timer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Interfaces and test cases per task; code written during TDD (user pre-approved the flow).

**Goal:** Media player page with cover art, firmware kitchen timer, five-button home, all inside the safe area.
**Spec:** `docs/superpowers/specs/2026-10-13-nspanel-round2-media-timer-design.md`

## Global Constraints
- Page ids: existing 0–6 unchanged; 7 `media`, 8 `timer`. New pictures appended: `home-on`, `media`, `media-bare`, `timer`.
- Everything visible within x ≤ 454 (`SAFE_RIGHT`); design grid 18–462 fitted to 14–441.
- Cover: 96×96, 32 colours, blue ×0.85, ≤ 40 strips per `cover_strips` call, ~120 ms between calls.
- Timer runs in the firmware; Homey only sets labels, starts timers via flow, receives `timer,finished`.

## Review Focus
- Cover drawn, then a text component on the media page refreshes: it must not overlap the cover area (layout test).
- Media page reopened: cover must be redrawn from the firmware cache after props replay.
- Track changes while a cover is being sent: the old cover must not be mixed into the new one (`cover_begin(id)` + sender cancellation).
- Timer finishes while Homey is offline: buzzer and "done" state still happen.
- Player without `volume_set` / `speaker_next`: those controls hidden, actions not sent.

### Task 1: Layout, art, component map, round-2 guide
`design/layout.ts` (+ `Component.kind: 'text' | 'progress'`, picture variants), `design/render.ts` (variants), `design/components.ts`, `design/round2.ts`, tests in `tests/design.test.ts`, `tests/components.test.ts`.
Tests: page ids 0–8; media/timer components inside safe area, no overlaps, no component overlapping `COVER` area; pictures list includes the 4 new ones and exports exist at 480×320; ROUND2.md lists the new pages as "build from COMPONENTS.md".

### Task 2: Firmware timer + cover cache
`firmware/nspanel_ui.h` (`TimerState`, `CoverCache`, pure enough for host tests), `firmware/nspanel.yaml` (actions, 1 s interval, localevent routing, buzzer, `on_page` redraw), `tests/firmware/*.cpp`, `tests/firmware.test.ts`.
Tests (host C++): add/start/pause/resume/reset/finish transitions and MM:SS formatting; finish emits once; CoverCache stores strips per id, `begin` clears, replay emits `fill` commands in order, strips for a stale id are ignored.

### Task 3: Cover pipeline
`lib/media/cover.ts` (+ `jpeg-js`, `pngjs`), tests `tests/cover.test.ts`.
Tests: cover-fit crop to 96×96; blue ×0.85; median cut returns ≤ 32 colours and maps every pixel; strips merge identical runs vertically and redraw the exact quantized image (round-trip); offsets applied.

### Task 4: Media selection and view
`lib/media/selection.ts`, `lib/panel/mediaView.ts`, `lib/panel/homeView.ts` (nav_med, tmr owned by firmware), config `media.players`, i18n labels, tests.
Tests: first playing in list wins; manual choice sticks until another starts; position extrapolation; Sonos vs Apple-TV capability sets (hidden controls, `prev_b`/`next_b` picc to bare, `vol` vis); empty list → "no player" text.

### Task 5: Actions, device wiring, flow cards, settings
`lib/actions/ActionRunner.ts` (media actions), `drivers/nspanel/device.ts` (media watch, cover fetch + paced sender, timer labels, timer flow cards, `timer,finished` trigger), `.homeycompose/flow/**`, `api.ts`, `settings/index.html` (Media tab with ordered player list), tests.
Tests: media actions map to capabilities incl. volume_up/down fallback and unsupported → no call; cover sender cancels on new id; timer label set built per language.

### Task 6: Deploy and verify (with the user)
Editor build from `tft/ROUND2.md`, TFT upload (reboot ESP before any retry), firmware OTA, app install, on-panel checks from Review Focus.
