'use strict';

import Homey from 'homey';
import { ActionRunner, HomeyActions, ThermostatTarget } from '../../lib/actions/ActionRunner';
import {
  DashboardConfig, capKey, loadConfig, watchedCapabilities,
} from '../../lib/config';
import {
  Lang, formatDate, t, timerLabels, toLang,
} from '../../lib/i18n';
import homeyIcons from '../../lib/homeyIcons.json';
import { CoverLoader } from '../../lib/media/coverLoader';
import { CoverSender } from '../../lib/media/coverSender';
import { MediaSource, albumArt, deviceIconKey } from '../../lib/media/mediaSource';
import { buildCalendarProps } from '../../lib/panel/calendarView';
import { ThermostatInfo, buildClimateProps } from '../../lib/panel/climateView';
import { buildHomeProps } from '../../lib/panel/homeView';
import { MediaPictures, buildMediaProps } from '../../lib/panel/mediaView';
import { buildMoodsProps } from '../../lib/panel/moodsView';
import { PanelConnection } from '../../lib/panel/PanelConnection';
import { PanelRenderer } from '../../lib/panel/PanelRenderer';
import { runReadySequence } from '../../lib/panel/readySequence';
import { pad2 } from '../../lib/panel/text';
import { UiEvent } from '../../lib/panel/uiEvents';
import { CalEvent, fetchCalendar, parseUpcoming } from '../../lib/sources/calendar';
import { CapabilitySource, DeviceProvider } from '../../lib/sources/CapabilitySource';
import tftIds from '../../lib/tftIds.json';
import { WeatherNow, fetchWeather } from '../../lib/weather';

/* eslint-disable @typescript-eslint/no-explicit-any */

const WEATHER_INTERVAL_MS = 30 * 60 * 1000;
const CALENDAR_INTERVAL_MS = 15 * 60 * 1000;
const RENDER_TICK_MS = 60 * 1000; // keeps date and "up next" current; unchanged values are not resent
const MOMENTARY_MS = 1500;
const CALENDAR_STALE_MS = 2 * CALENDAR_INTERVAL_MS;
const MEDIA_TICK_MS = 1000; // position/progress on the media page while playing
// Album art often changes a moment after the track: look once soon and once more a bit later.
const COVER_CHECKS_MS = [1500, 6000];
const COVER_REPAINT_MS = 150; // renderer batch (50 ms) + panel repaint of the placeholder icon

const SENSOR_CAPABILITIES: Record<string, string> = {
  RSSI: 'nspanel_rssi',
  'Current page': 'nspanel_page',
  'Version TFT': 'nspanel_version_tft',
  'Version ESPHome': 'nspanel_version_esphome',
};

const tileKeys = (index: number): string[] => [`moods.i${pad2(index + 1)}.picc`, `moods.l${pad2(index + 1)}.picc`];
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const ICONS = homeyIcons as Record<string, string>;
const MEDIA_PICS: MediaPictures | null = [tftIds.pics.home, tftIds.pics.home_on, tftIds.pics.media, tftIds.pics.media_bare]
  .every((v) => typeof v === 'number')
  ? {
    home: tftIds.pics.home, homeOn: tftIds.pics.home_on, media: tftIds.pics.media, mediaBare: tftIds.pics.media_bare,
  } : null;

class NSPanelDevice extends Homey.Device {
  private panel!: PanelConnection;
  private renderer!: PanelRenderer;
  private api: any = null;
  private capabilities: CapabilitySource | null = null;
  private runner!: ActionRunner;
  private config!: DashboardConfig;
  private weather: WeatherNow | null = null;
  private events: CalEvent[] | null = null;
  private calendarUrl = '';
  private calendarOkAt = 0;
  private thermostat: ThermostatInfo | null = null;
  private panelTemperature: number | null = null;
  private momentary = new Set<number>();
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;
  private intervals: Array<ReturnType<typeof setInterval>> = [];
  private media: MediaSource | null = null;
  private mediaPlayers = '';
  private cover!: CoverLoader;
  private coverShown = false;
  private coverChecks: Array<ReturnType<typeof setTimeout>> = [];
  private page = '';

  async onInit(): Promise<void> {
    for (const cap of ['nspanel_version_blueprint', 'nspanel_brightness']) {
      if (this.hasCapability(cap)) await this.removeCapability(cap).catch(this.error);
    }

    this.config = this.readConfig();
    this.renderer = new PanelRenderer(
      (keys, values) => this.panel.call('set_props', { keys, values }),
      (fn, ms) => {
        this.homey.setTimeout(fn, ms);
      },
      50,
      (err) => this.error('Render failed:', err),
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const { HomeyAPI } = require('homey-api');
      this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
      const provider: DeviceProvider = { getDevice: (id) => this.api.devices.getDevice({ id }) };
      this.capabilities = new CapabilitySource(provider, () => this.render(), (...a) => this.error(...a));
      this.media = new MediaSource(
        { getDevice: (id) => this.api.devices.getDevice({ id }) },
        (driverId) => ICONS[deviceIconKey(driverId)] ?? '',
        (trackChanged) => {
          this.render();
          if (trackChanged) this.scheduleCover();
        },
        Date.now,
        (...a) => this.error(...a),
      );
    } catch (err) {
      this.error('homey-api unavailable; device values will not be shown:', err);
    }
    this.runner = new ActionRunner(
      () => this.config,
      this.homeyActions(),
      () => this.thermostatTarget(),
      (...a) => this.error(...a),
      { active: () => this.media?.active() ?? null, nextPlayer: () => this.media?.nextPlayer() },
    );
    this.cover = new CoverLoader({
      art: async (id) => albumArt((await this.api.devices.getDevice({ id })).images),
      fetch: (url) => this.fetchHomeyImage(url),
      sender: new CoverSender(
        (action, args) => this.panel.call(action, args),
        (ms) => this.sleep(ms),
      ),
      shown: async (on) => {
        if (on === this.coverShown) return;
        this.coverShown = on;
        this.render();
        await this.sleep(COVER_REPAINT_MS);
      },
      error: (...a) => this.error(...a),
    });

    this.registerCapabilityListener('onoff', async (value: boolean) => {
      await this.panel.call('set_brightness', { brightness: value ? 100 : 0 });
    });

    this.connect();
    this.intervals.push(
      this.homey.setInterval(() => this.refreshWeather().catch(this.error), WEATHER_INTERVAL_MS),
      this.homey.setInterval(() => this.refreshCalendar().catch(this.error), CALENDAR_INTERVAL_MS),
      this.homey.setInterval(() => this.render(), RENDER_TICK_MS),
      this.homey.setInterval(() => {
        if (this.page === 'media' && this.media?.active()?.playing) this.render();
      }, MEDIA_TICK_MS),
    );
    this.refreshWeather().catch(this.error);
    this.refreshCalendar().catch(this.error);
  }

  private homeyActions(): HomeyActions {
    const requireApi = (): any => {
      if (!this.api) throw new Error('Homey API unavailable');
      return this.api;
    };
    return {
      setMood: async (id) => {
        await requireApi().moods.setMood({ id });
      },
      triggerFlow: async (id, advanced) => {
        if (advanced) await requireApi().flow.triggerAdvancedFlow({ id });
        else await requireApi().flow.triggerFlow({ id });
      },
      setCapability: async (deviceId, capabilityId, value) => {
        await requireApi().devices.setCapabilityValue({ deviceId, capabilityId, value });
      },
      getCapability: (deviceId, capability) => this.capabilities?.values.get(capKey(deviceId, capability)),
      fireTileTrigger: async (tile, label) => {
        await this.homey.flow.getDeviceTriggerCard('tile_pressed').trigger(this, { tile, label }, { tile: String(tile) });
      },
    };
  }

  private thermostatTarget(): ThermostatTarget | null {
    const id = this.config.home.thermostat?.deviceId;
    if (!id || !this.thermostat) return null;
    return {
      deviceId: id, min: this.thermostat.min, max: this.thermostat.max, step: this.thermostat.step,
    };
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
    this.panel.on('ready', () => {
      this.onPanelReady().catch(this.error);
    });
    this.panel.on('disconnected', () => {
      this.setUnavailable('Disconnected from panel').catch(this.error);
    });
    this.panel.on('fatal', (message: string) => {
      this.setUnavailable(message).catch(this.error);
    });
    this.panel.on('ui', (ev: UiEvent) => {
      this.onUiEvent(ev).catch(this.error);
    });
    this.panel.on('sensor', (s2: { name: string; value: unknown }) => this.onSensor(s2.name, s2.value));
    // Unavailable until the first 'ready': the library only emits 'disconnected' after a successful connect.
    this.setUnavailable('Connecting to panel…').catch(this.error);
    this.panel.start();
  }

  private async onPanelReady(): Promise<void> {
    this.renderer.reset(); // panel may have rebooted: its cache is empty
    this.cover.reset(); // and so is its cover cache
    await runReadySequence({
      repaint: () => this.render(),
      steps: [
        () => this.setAvailable(),
        () => this.setCapabilityValue('onoff', true),
        () => this.pushPanelSettings(),
        () => this.loadThermostat(),
        async () => {
          await this.capabilities?.watch(watchedCapabilities(this.config));
        },
        () => this.pushTimerLabels(),
        () => this.watchMedia(true),
      ],
      onError: (err) => this.error('Panel ready step failed:', err),
    });
  }

  private async pushPanelSettings(): Promise<void> {
    const s = this.getSettings();
    await this.panel.call('set_clock_format', { h24: s.timeFormat !== 'h:mm A' });
    await this.panel.call('set_button_mode', { button: 'left', relay: this.config.buttons.left === 'relay' });
    await this.panel.call('set_button_mode', { button: 'right', relay: this.config.buttons.right === 'relay' });
    await this.panel.call('send_command', { cmd: `ss_min=${this.config.screen.screensaverMinutes}` });
    await this.panel.call('send_command', { cmd: `ss_dim=${this.config.screen.screensaverBrightness}` });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.homey.setTimeout(resolve, ms);
    });
  }

  private async pushTimerLabels(): Promise<void> {
    await this.panel.call('timer_labels', { labels: timerLabels(this.lang()) });
  }

  private async watchMedia(force = false): Promise<void> {
    const players = this.config.media.players.join(',');
    if (!force && players === this.mediaPlayers) return;
    this.mediaPlayers = players;
    await this.media?.setPlayers(this.config.media.players);
    this.scheduleCover();
  }

  private scheduleCover(): void {
    this.coverChecks.forEach((c) => this.homey.clearTimeout(c));
    this.coverChecks = COVER_CHECKS_MS.map((ms) => this.homey.setTimeout(() => {
      if (!this.panel?.connected) return;
      this.cover.refresh(this.media?.active()?.deviceId ?? null).catch(this.error);
    }, ms));
  }

  // Images of other apps' devices (album art) through the local Web API, with the owner token.
  private async fetchHomeyImage(path: string): Promise<Uint8Array> {
    const base = await this.homey.api.getLocalUrl();
    const token = await this.homey.api.getOwnerApiToken();
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Image ${path}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async startTimer(minutes: number): Promise<void> {
    await this.panel.call('timer_set', { seconds: Math.round(minutes * 60), start: true });
  }

  private async loadThermostat(): Promise<void> {
    const id = this.config.home.thermostat?.deviceId;
    if (!id || !this.api) {
      this.thermostat = null;
      return;
    }
    const device = await this.api.devices.getDevice({ id });
    const zone = device.zone ? await this.api.zones.getZone({ id: device.zone }).catch(() => null) : null;
    const opts = device.capabilitiesObj?.target_temperature ?? {};
    this.thermostat = {
      name: device.name ?? '',
      zone: zone?.name ?? '',
      min: num(opts.min, 5),
      max: num(opts.max, 30),
      step: num(opts.step, 0.5),
    };
    this.render();
  }

  private lang(): Lang {
    return toLang(this.getSettings().language);
  }

  private render(): void {
    if (!this.panel?.connected) return;
    const s = this.getSettings();
    const lang = this.lang();
    const now = new Date();
    const timeZone = this.homey.clock.getTimezone();
    const h24 = s.timeFormat !== 'h:mm A';
    const values = this.capabilities?.values ?? new Map<string, unknown>();
    const weather = s.weatherEnabled === false ? null : this.weather;
    const upcoming = this.events ? this.events.filter((e) => e.end > now) : null;
    const thermostatId = this.config.home.thermostat?.deviceId;
    const valueOf = (cap: string): number | null => {
      const v = thermostatId ? values.get(capKey(thermostatId, cap)) : null;
      return typeof v === 'number' ? v : null;
    };
    const tileStates = this.config.moods.map((tile, i) => this.momentary.has(i)
      || (tile?.type === 'toggle' && values.get(capKey(tile.deviceId, 'onoff')) === true));
    const pics = typeof tftIds.pics.moods === 'number' && typeof tftIds.pics.moods_on === 'number'
      ? { off: tftIds.pics.moods, on: tftIds.pics.moods_on } : null;
    const fonts = typeof tftIds.fonts.small === 'number' && typeof tftIds.fonts.body === 'number'
      ? { small: tftIds.fonts.small, body: tftIds.fonts.body } : null;

    this.renderer.update({
      ...buildHomeProps(this.config, {
        lang,
        dateText: formatDate(now, s.dateFormat || 'ddd DD MMM', lang, timeZone),
        values,
        weather,
        panelTemperature: this.panelTemperature,
        events: upcoming,
        now,
        timeZone,
        h24,
      }),
      ...buildMoodsProps(this.config, tileStates, lang, pics),
      ...buildClimateProps({
        lang,
        current: valueOf('measure_temperature'),
        target: valueOf('target_temperature'),
        thermostat: this.thermostat,
        outside: weather?.temperature ?? null,
      }),
      ...buildCalendarProps(upcoming ?? [], {
        now,
        lang,
        timeZone,
        h24,
        fonts,
        stale: Boolean(this.config.calendar) && Date.now() - this.calendarOkAt > CALENDAR_STALE_MS,
      }),
      ...buildMediaProps({
        lang,
        now: now.getTime(),
        player: this.media?.active() ?? null,
        anyPlaying: this.media?.anyPlaying() ?? false,
        coverShown: this.coverShown,
        pics: MEDIA_PICS,
      }),
      'screensaver.date.txt': formatDate(now, s.dateFormat || 'ddd DD MMM', lang, timeZone),
      'notification.close_lbl.txt': t(lang, 'close'),
    });
  }

  private async refreshWeather(): Promise<void> {
    if (this.getSettings().weatherEnabled === false) return;
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    this.weather = await fetchWeather(lat, lon);
    this.render();
  }

  async refreshCalendar(): Promise<void> {
    const cal = this.config.calendar;
    if (cal?.url !== this.calendarUrl) {
      // A different (or removed) calendar: never keep showing the previous one's events.
      this.calendarUrl = cal?.url ?? '';
      this.events = null;
      this.calendarOkAt = 0;
    }
    if (!cal) {
      this.render();
      return;
    }
    try {
      const ics = await fetchCalendar(cal.url);
      this.events = parseUpcoming(ics, new Date(), cal.daysAhead, this.homey.clock.getTimezone());
      this.calendarOkAt = Date.now();
    } finally {
      this.render();
    }
  }

  private onSensor(name: string, value: unknown): void {
    if (name === 'Current page' && typeof value === 'string') this.page = value;
    if (name === 'Temperature' && typeof value === 'number') {
      this.panelTemperature = value;
      this.setCapabilityValue('measure_temperature', value).catch(this.error);
      this.render();
      return;
    }
    const cap = SENSOR_CAPABILITIES[name];
    if (cap && this.hasCapability(cap)) this.setCapabilityValue(cap, value).catch(this.error);
  }

  private async onUiEvent(ev: UiEvent): Promise<void> {
    this.log('UI event:', JSON.stringify(ev));
    if (ev.type === 'hw_button') {
      const state = { button: ev.button, action: ev.action === 'long' ? 'long_click' : 'short_click' };
      await this.homey.flow.getDeviceTriggerCard('physical_button_pressed').trigger(this, state, state);
      return;
    }
    const result = await this.runner.handle(ev);
    if (result.momentaryTile !== undefined) {
      const index = result.momentaryTile;
      this.momentary.add(index);
      this.renderer.forget(tileKeys(index));
      this.render();
      this.homey.setTimeout(() => {
        this.momentary.delete(index);
        this.render();
      }, MOMENTARY_MS);
    }
    if (result.revertTile !== undefined) {
      this.renderer.forget(tileKeys(result.revertTile));
      this.render();
    }
    if (result.revertClimate) {
      // The panel shows a target Homey did not take; resend the real one.
      this.renderer.forget(['climate.tgt.val', 'climate.tgt_txt.txt']);
      this.render();
    }
    if (result.mediaChanged) {
      this.render();
      this.scheduleCover();
    }
    if (result.timerFinished) await this.homey.flow.getDeviceTriggerCard('timer_finished').trigger(this, {}, {});
    if (result.error) await this.showNotification(t(this.lang(), 'actionFailed'), result.error, 5);
  }

  async onConfigUpdated(): Promise<void> {
    this.config = this.readConfig();
    this.refreshCalendar().catch(this.error);
    if (!this.panel?.connected) return;
    await this.pushPanelSettings();
    await this.loadThermostat().catch(this.error);
    await this.capabilities?.watch(watchedCapabilities(this.config));
    await this.watchMedia();
    this.render();
  }

  async showNotification(heading: string, message: string, timeout: number): Promise<void> {
    await this.panel.call('set_props', {
      keys: ['notification.heading.txt', 'notification.body.txt'],
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
    if (changedKeys.includes('language')) this.homey.setTimeout(() => this.pushTimerLabels().catch(this.error), 0);
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
    if (this.notificationTimer) this.homey.clearTimeout(this.notificationTimer);
    this.coverChecks.forEach((c) => this.homey.clearTimeout(c));
    this.capabilities?.destroy();
    this.media?.destroy();
    this.panel?.stop();
  }
}

module.exports = NSPanelDevice;
