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
      (fn, ms) => {
        this.homey.setTimeout(fn, ms);
      },
      50,
      (err) => this.error('Render failed:', err),
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
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
    this.panel.on('ready', () => {
      this.onPanelReady().catch(this.error);
    });
    this.panel.on('disconnected', () => {
      this.setUnavailable('Disconnected from panel').catch(this.error);
    });
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
