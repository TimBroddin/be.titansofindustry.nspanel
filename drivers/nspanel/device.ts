'use strict';

import Homey from 'homey';
import { Client, ClientConfig } from 'esphome-native-api';

// ESPHome service definition from ListEntitiesServicesResponse
interface ESPHomeServiceArg {
  name: string;
  type: number; // 0=bool, 1=int, 2=float, 3=string, 4=bool[], 5=int[], 6=float[], 7=string[]
}

interface ESPHomeService {
  name: string;
  key: number;
  argsList: ESPHomeServiceArg[];
}

// Extended connection interface with raw message sending
interface ESPHomeConnection {
  connected: boolean;
  authorized: boolean;
  sendMessage(message: unknown): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface ChipConfig {
  device: string;
  capability: string;
  icon: string;
  unit: string;
}

interface NSPanelEntityConfig {
  device: string;
  capability: string;
  icon: string;
  label: string;
}

interface NSPanelConfig {
  chips: ChipConfig[];
  entities: NSPanelEntityConfig[];
}

interface DeviceSettings {
  host: string;
  port: number;
  password: string;
  encryptionKey: string;
  weatherEnabled: boolean;
  weatherUpdateInterval: number;
  dateFormat: string;
  timeFormat: string;
}

// Open-Meteo API response
interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    weather_code: number;
  };
}

type HomeySettings = { [key: string]: string | number | boolean };

interface ButtonClickEvent {
  page: string;
  component: string;
  command: string;
}

interface EntityState {
  key: number;
  state: unknown;
  missingState?: boolean;
}

interface EntityConfig {
  key: number;
  name: string;
  uniqueId?: string;
  objectId?: string;
}

interface BaseEntity {
  config: EntityConfig;
  type: string;
  id: number;
  state?: EntityState;
  on: (event: string, handler: (state: EntityState) => void) => void;
}

// Home Assistant service/event message from ESPHome
interface HomeAssistantServiceMessage {
  service: string;
  isEvent: boolean;
  dataList: Array<{
    key: string;
    value: string;
  }>;
  dataTemplateList: Array<{
    key: string;
    value: string;
  }>;
  variablesList: Array<string>;
}

// Import protobuf messages for service execution
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pb = require('esphome-native-api/lib/protoc/api_pb');

// HomeyAPI types
interface HomeyAPIDevice {
  id: string;
  name: string;
  capabilities: string[];
  capabilitiesObj: Record<string, { value?: unknown }>;
}

interface HomeyAPIInstance {
  devices: {
    getDevices(): Promise<Record<string, HomeyAPIDevice>>;
    getCapabilityValue(opts: { deviceId: string; capabilityId: string }): Promise<unknown>;
  };
}

class NSPanelDevice extends Homey.Device {
  private client: Client | null = null;
  private connection: ESPHomeConnection | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private timeUpdateTimer: ReturnType<typeof setInterval> | null = null;
  private weatherUpdateTimer: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private entities: Map<number, BaseEntity> = new Map();
  private services: Map<string, ESPHomeService> = new Map();
  private servicesReady = false;
  private buttonPressTime: Map<string, number> = new Map(); // Track button press times for short/long detection
  private readonly LONG_PRESS_THRESHOLD = 600; // ms - threshold for long press
  private homeyApi: HomeyAPIInstance | null = null;

  async onInit(): Promise<void> {
    this.log('NSPanel device initialized');

    // Initialize HomeyAPI for accessing all devices
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { HomeyAPI } = require('homey-api');
      this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey }) as HomeyAPIInstance;
      this.log('HomeyAPI initialized successfully');
    } catch (error) {
      this.error('Failed to initialize HomeyAPI:', error);
    }

    // Register capability listeners
    this.registerCapabilityListener('onoff', async (value: boolean) => {
      if (value) {
        await this.wakeUp();
      }
      // For turning off, we don't have a direct sleep command
      // The panel will sleep automatically based on its timeout settings
    });

    // Connect to the device
    await this.connect();
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.client?.connected) {
      return;
    }

    this.isConnecting = true;
    const settings = this.getSettings() as DeviceSettings;

    if (!settings.host) {
      this.setUnavailable('No host configured').catch(this.error);
      this.isConnecting = false;
      return;
    }

    try {
      this.log(`Connecting to NSPanel at ${settings.host}:${settings.port}`);

      const clientConfig: ClientConfig = {
        host: settings.host,
        port: settings.port || 6053,
        reconnect: false, // We handle reconnection ourselves
        pingInterval: 15000,
        pingAttempts: 3,
        password: settings.password || undefined,
        encryptionKey: settings.encryptionKey || undefined,
      };

      this.client = new Client(clientConfig);

      this.client.on('connected', () => {
        this.log('Connected to NSPanel');
        // Connection is available on the client object, not passed as parameter
        this.connection = this.client?.connection as unknown as ESPHomeConnection ?? null;
        this.services.clear();
        this.servicesReady = false;
        this.setAvailable().catch(this.error);
        this.setCapabilityValue('onoff', true).catch(this.error);

        // Listen for service definitions on the connection
        if (this.connection) {
          this.connection.on('message.ListEntitiesServicesResponse', (service: ESPHomeService) => {
            this.log(`Discovered service: ${service.name} (key: ${service.key})`, JSON.stringify(service));
            this.services.set(service.name, service);
          });

          this.connection.on('message.ListEntitiesDoneResponse', () => {
            this.log(`Entity discovery complete. Found ${this.services.size} services.`);
            // Give a bit more time for service discovery (services come after entities)
            setTimeout(() => {
              if (!this.servicesReady) {
                this.servicesReady = true;
                this.log(`Starting updates with ${this.services.size} services available.`);
                // Start automatic updates
                this.startTimeUpdates();
                this.startWeatherUpdates();
                this.startChipUpdates();
              }
            }, 1000);
          });

          // Listen for Home Assistant service/event calls from the panel
          // This is how NSPanel HA Blueprint sends button events
          this.connection.on('message.HomeassistantServiceResponse', (msg: HomeAssistantServiceMessage) => {
            this.log('HA Service/Event:', JSON.stringify(msg));
            this.handleHomeAssistantEvent(msg);
          });

          // Also listen for all messages to debug what's coming through
          this.connection.on('message', (type: string, msg: unknown) => {
            if (!type.includes('Ping') && !type.includes('State')) {
              this.log(`Message [${type}]:`, JSON.stringify(msg));
            }
          });
        }

        // Fallback: Start updates after 5 seconds if services haven't been discovered
        setTimeout(() => {
          if (!this.servicesReady && this.connection) {
            this.log('Fallback: Starting updates without full service discovery');
            this.servicesReady = true;
            this.startTimeUpdates();
            this.startWeatherUpdates();
            this.startChipUpdates();
          }
        }, 5000);
      });

      this.client.on('disconnected', () => {
        this.log('Disconnected from NSPanel');
        this.connection = null;
        this.services.clear();
        this.servicesReady = false;
        this.setUnavailable('Disconnected from device').catch(this.error);
        this.scheduleReconnect();
      });

      this.client.on('error', (error: Error) => {
        // Ignore "deserializeBinary" errors - these are caused by unknown message types
        // from newer ESPHome versions that the library doesn't support yet
        if (error.message?.includes('deserializeBinary')) {
          this.log('Ignoring unknown ESPHome message type (library limitation)');
          return;
        }
        this.error('Connection error:', error);
        this.setUnavailable(`Connection error: ${error.message}`).catch(this.error);
        this.scheduleReconnect();
      });

      this.client.on('deviceInfo', (info: Record<string, unknown>) => {
        this.log('Device info:', info);
      });

      this.client.on('newEntity', (entity: BaseEntity) => {
        this.handleNewEntity(entity);
      });

      this.client.on('logs', (log: { message?: string; level?: number }) => {
        this.parseLogForButtonEvents(log.message || '');
      });

      this.client.connect();
    } catch (error) {
      this.error('Failed to connect:', error);
      this.setUnavailable(`Failed to connect: ${(error as Error).message}`).catch(this.error);
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private handleNewEntity(entity: BaseEntity): void {
    const entityName = entity.config?.name || 'Unknown';
    this.log(`Discovered entity: ${entityName} (${entity.type}), key: ${entity.id}`);
    this.entities.set(entity.id, entity);

    // Handle binary sensors (physical buttons)
    if (entity.type === 'BinarySensor') {
      entity.on('state', (state: EntityState) => {
        const isPressed = state.state as boolean;
        const name = entityName.toLowerCase();

        // Check if this is a physical button
        if (name.includes('left') || name.includes('right')) {
          const button = name.includes('left') ? 'left' : 'right';
          this.log(`Physical button ${button}: ${isPressed ? 'pressed' : 'released'}`);

          if (isPressed) {
            // Track press start time
            this.buttonPressTime.set(button, Date.now());
          } else {
            // Button released - determine if short or long click
            const pressStart = this.buttonPressTime.get(button);
            if (pressStart) {
              const pressDuration = Date.now() - pressStart;
              const action = pressDuration >= this.LONG_PRESS_THRESHOLD ? 'long_click' : 'short_click';

              this.log(`Physical button ${button}: ${action} (${pressDuration}ms)`);

              // Trigger flow
              this.driver.ready().then(() => {
                const triggerCard = this.homey.flow.getDeviceTriggerCard('physical_button_pressed');
                triggerCard.trigger(this as unknown as Homey.Device, { button, action }, { button, action }).catch(this.error);
              }).catch(this.error);

              this.buttonPressTime.delete(button);
            }
          }
        }
      });
    }

    // Handle text sensors (current page, versions, etc.)
    if (entity.type === 'TextSensor') {
      entity.on('state', (state: EntityState) => {
        const name = entityName.toLowerCase();
        const value = state.state as string;
        this.log(`TextSensor ${entityName} state: ${value}`);

        // Current page
        if (name.includes('current page')) {
          this.log(`Current page: ${value}`);
          this.setCapabilityValue('nspanel_page', value).catch(this.error);
        }

        // Blueprint version
        if (name.includes('version blueprint')) {
          this.log(`Blueprint version: ${value}`);
          this.setCapabilityValue('nspanel_version_blueprint', value).catch(this.error);
        }

        // ESPHome version
        if (name.includes('version esphome')) {
          this.log(`ESPHome version: ${value}`);
          this.setCapabilityValue('nspanel_version_esphome', value).catch(this.error);
        }

        // TFT version
        if (name.includes('version tft')) {
          this.log(`TFT version: ${value}`);
          this.setCapabilityValue('nspanel_version_tft', value).catch(this.error);
        }
      });
    }

    // Handle sensor entities (temperature, RSSI, brightness, etc.)
    if (entity.type === 'Sensor') {
      entity.on('state', (state: EntityState) => {
        const name = entityName.toLowerCase();
        this.log(`Sensor ${entityName} state: ${state.state}, missingState: ${state.missingState}`);

        if (state.missingState) {
          return;
        }

        // Temperature sensor
        if (name.includes('temperature')) {
          const temp = state.state as number;
          this.log(`Temperature: ${temp}`);
          this.setCapabilityValue('measure_temperature', temp).catch(this.error);
        }

        // RSSI (WiFi signal strength)
        if (name.includes('rssi')) {
          const rssi = state.state as number;
          this.log(`RSSI: ${rssi} dBm`);
          this.setCapabilityValue('nspanel_rssi', rssi).catch(this.error);
        }

        // Display brightness
        if (name.includes('brightness') && !name.includes('current')) {
          const brightness = state.state as number;
          // Convert 0-100 brightness to percentage if needed
          const brightnessPercent = brightness > 1 ? brightness : brightness * 100;
          this.log(`Brightness: ${brightnessPercent}%`);
          this.setCapabilityValue('nspanel_brightness', Math.round(brightnessPercent)).catch(this.error);
        }
      });
    }
  }

  private parseLogForButtonEvents(message: string): void {
    // NSPanel logs button events in verbose mode
    // Try to parse button click events from logs
    // Format examples from the firmware:
    // "Send 'button_click' event to HA:"
    // "  page: buttonpage01"
    // "  component: bt01"
    // "  command: short_click"

    if (message.includes('button_click') || message.includes('hw_bt_left') || message.includes('hw_bt_right')) {
      this.log('Potential button event in log:', message);

      // Try to extract structured data
      // The logs come as separate lines, so we need to aggregate

      // Check for hardware button pattern
      const hwButtonMatch = message.match(/(hw_bt_left|hw_bt_right)/);
      const commandMatch = message.match(/(short_click|long_click|released?)/i);

      if (hwButtonMatch && commandMatch) {
        const button = hwButtonMatch[1].includes('left') ? 'left' : 'right';
        const action = commandMatch[1].toLowerCase().replace('released', 'release');

        this.log(`Physical button event: ${button} ${action}`);

        // Trigger flow
        this.driver.ready().then(() => {
          const triggerCard = this.homey.flow.getDeviceTriggerCard('physical_button_pressed');
          triggerCard.trigger(this as unknown as Homey.Device, { button, action }, { button, action }).catch(this.error);
        }).catch(this.error);
      }

      // Check for touch button pattern
      const pageMatch = message.match(/page:\s*(\w+)/i);
      const componentMatch = message.match(/component:\s*(\w+)/i);
      const touchCommandMatch = message.match(/command:\s*(\w+)/i);

      if (pageMatch && componentMatch && touchCommandMatch) {
        const event: ButtonClickEvent = {
          page: pageMatch[1],
          component: componentMatch[1],
          command: touchCommandMatch[1],
        };

        this.log(`Touch button event: ${event.page}.${event.component} ${event.command}`);

        // Trigger flow
        this.driver.ready().then(() => {
          const triggerCard = this.homey.flow.getDeviceTriggerCard('button_pressed');
          triggerCard.trigger(
            this as unknown as Homey.Device,
            { button: event.component, action: event.command, page: event.page },
            { page: event.page, component: event.component, command: event.command },
          ).catch(this.error);
        }).catch(this.error);
      }
    }
  }

  private handleHomeAssistantEvent(msg: HomeAssistantServiceMessage): void {
    // NSPanel HA Blueprint sends button events as HA events
    // Event name is typically 'esphome.nspanel_event' or similar
    // Data contains: page, component, command (or button info for hw buttons)

    if (!msg.isEvent) {
      // Not an event, might be a service call - log it for debugging
      this.log('HA Service call (not event):', msg.service);
      return;
    }

    // Convert dataList to an object for easier access
    const data: Record<string, string> = {};
    for (const item of msg.dataList || []) {
      data[item.key] = item.value;
    }

    this.log('HA Event data:', JSON.stringify(data));

    // Check for button_click event (touch buttons)
    if (data.page && data.component && data.command) {
      const event: ButtonClickEvent = {
        page: data.page,
        component: data.component,
        command: data.command,
      };

      this.log(`Touch button event from HA: ${event.page}.${event.component} ${event.command}`);

      // Trigger flow
      this.driver.ready().then(() => {
        const triggerCard = this.homey.flow.getDeviceTriggerCard('button_pressed');
        triggerCard.trigger(
          this as unknown as Homey.Device,
          { button: event.component, action: event.command, page: event.page },
          { page: event.page, component: event.component, command: event.command },
        ).catch(this.error);
      }).catch(this.error);
    }

    // Check for hardware button events
    // The format might be button: hw_bt_left, action: short_click
    if (data.button && (data.button.includes('hw_bt') || data.button.includes('left') || data.button.includes('right'))) {
      const button = data.button.includes('left') ? 'left' : 'right';
      const action = (data.action || data.command || 'short_click').toLowerCase().replace('released', 'release');

      this.log(`Physical button event from HA: ${button} ${action}`);

      // Trigger flow
      this.driver.ready().then(() => {
        const triggerCard = this.homey.flow.getDeviceTriggerCard('physical_button_pressed');
        triggerCard.trigger(this as unknown as Homey.Device, { button, action }, { button, action }).catch(this.error);
      }).catch(this.error);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = this.homey.setTimeout(async () => {
      this.log('Attempting to reconnect...');
      await this.connect();
    }, 30000);
  }

  private startTimeUpdates(): void {
    // Clear existing timer
    if (this.timeUpdateTimer) {
      this.homey.clearInterval(this.timeUpdateTimer);
    }

    // Update immediately
    this.updateTimeAndDate().catch(this.error);

    // Update every minute
    this.timeUpdateTimer = this.homey.setInterval(() => {
      this.updateTimeAndDate().catch(this.error);
    }, 60000);
  }

  private stopTimeUpdates(): void {
    if (this.timeUpdateTimer) {
      this.homey.clearInterval(this.timeUpdateTimer);
      this.timeUpdateTimer = null;
    }
  }

  private async updateTimeAndDate(): Promise<void> {
    if (!this.connection) {
      return;
    }

    const settings = this.getSettings() as DeviceSettings;

    // Get local time using Homey's timezone
    const timezone = this.homey.clock.getTimezone();
    const now = new Date();

    // Format time using timezone
    const timeStr = this.formatTime(now, settings.timeFormat || 'HH:mm', timezone);
    await this.updateHomeEntity('time', timeStr).catch(this.error);

    // Format date using timezone
    const dateStr = this.formatDate(now, settings.dateFormat || 'ddd DD MMM', timezone);
    await this.updateHomeEntity('date', dateStr).catch(this.error);

    // Also update chips every minute
    await this.updateAllChips().catch(this.error);
  }

  private formatTime(date: Date, format: string, timezone: string): string {
    // Use Intl.DateTimeFormat to get proper timezone-aware time
    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: format === 'h:mm A',
    };

    if (format === 'h:mm A') {
      return date.toLocaleTimeString('en-US', timeOptions);
    }
    // Default: HH:mm (24-hour)
    return date.toLocaleTimeString('en-GB', timeOptions);
  }

  private formatDate(date: Date, format: string, timezone: string): string {
    // Get date components in the correct timezone
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    };

    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
    const getPart = (type: string): string => parts.find(p => p.type === type)?.value || '';

    const day = getPart('day');
    const dayPadded = day.padStart(2, '0');
    const monthNum = (new Date(date.toLocaleString('en-US', { timeZone: timezone })).getMonth() + 1).toString();
    const monthPadded = monthNum.padStart(2, '0');
    const year = getPart('year');
    const dayName = getPart('weekday');
    const monthName = getPart('month');

    switch (format) {
      case 'DD/MM/YYYY':
        return `${dayPadded}/${monthPadded}/${year}`;
      case 'MM/DD/YYYY':
        return `${monthPadded}/${dayPadded}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${monthPadded}-${dayPadded}`;
      case 'DD MMM YYYY':
        return `${day} ${monthName} ${year}`;
      case 'ddd DD MMM':
      default:
        return `${dayName} ${day} ${monthName}`;
    }
  }

  private startWeatherUpdates(): void {
    // Clear existing timer
    if (this.weatherUpdateTimer) {
      this.homey.clearInterval(this.weatherUpdateTimer);
    }

    const settings = this.getSettings() as DeviceSettings;
    if (settings.weatherEnabled === false) {
      this.log('Weather updates disabled');
      return;
    }

    // Update immediately
    this.fetchAndUpdateWeather().catch(this.error);

    // Update at configured interval (default 30 minutes)
    const intervalMs = (settings.weatherUpdateInterval || 30) * 60 * 1000;
    this.weatherUpdateTimer = this.homey.setInterval(() => {
      this.fetchAndUpdateWeather().catch(this.error);
    }, intervalMs);
  }

  private stopWeatherUpdates(): void {
    if (this.weatherUpdateTimer) {
      this.homey.clearInterval(this.weatherUpdateTimer);
      this.weatherUpdateTimer = null;
    }
  }

  private async fetchAndUpdateWeather(): Promise<void> {
    if (!this.connection) {
      return;
    }

    const settings = this.getSettings() as DeviceSettings;
    if (settings.weatherEnabled === false) {
      return;
    }

    try {
      // Get Homey's location
      const latitude = this.homey.geolocation.getLatitude();
      const longitude = this.homey.geolocation.getLongitude();

      this.log(`Geolocation: lat=${latitude}, lon=${longitude}`);

      // Check for null/undefined (0 is a valid coordinate)
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
        this.log('Homey location not configured. Please set your location in Homey settings.');
        return;
      }

      // Use Open-Meteo API (free, no API key required)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
      const response = await fetch(url);

      if (!response.ok) {
        this.error('Failed to fetch weather:', response.statusText);
        return;
      }

      const data = await response.json() as OpenMeteoResponse;
      const temp = Math.round(data.current.temperature_2m);
      const condition = this.mapOpenMeteoCondition(data.current.weather_code);

      this.log(`Weather update: ${temp}°C, ${condition}`);

      // Update the panel
      await this.updateWeather(temp.toString(), condition);
    } catch (error) {
      this.error('Error fetching weather:', error);
    }
  }

  private mapOpenMeteoCondition(weatherCode: number): string {
    // Map Open-Meteo WMO weather codes to NSPanel conditions
    // https://open-meteo.com/en/docs (WMO Weather interpretation codes)
    switch (weatherCode) {
      case 0: // Clear sky
        return 'sunny';
      case 1: // Mainly clear
      case 2: // Partly cloudy
        return 'partlycloudy';
      case 3: // Overcast
        return 'cloudy';
      case 45: // Fog
      case 48: // Depositing rime fog
        return 'fog';
      case 51: // Light drizzle
      case 53: // Moderate drizzle
      case 55: // Dense drizzle
        return 'rainy';
      case 56: // Light freezing drizzle
      case 57: // Dense freezing drizzle
        return 'snowy-rainy';
      case 61: // Slight rain
      case 63: // Moderate rain
        return 'rainy';
      case 65: // Heavy rain
      case 80: // Slight rain showers
      case 81: // Moderate rain showers
      case 82: // Violent rain showers
        return 'pouring';
      case 66: // Light freezing rain
      case 67: // Heavy freezing rain
        return 'snowy-rainy';
      case 71: // Slight snow
      case 73: // Moderate snow
      case 75: // Heavy snow
      case 77: // Snow grains
      case 85: // Slight snow showers
      case 86: // Heavy snow showers
        return 'snowy';
      case 95: // Thunderstorm
      case 96: // Thunderstorm with slight hail
      case 99: // Thunderstorm with heavy hail
        return 'lightning';
      default:
        return 'sunny';
    }
  }

  private startChipUpdates(): void {
    // Update chips immediately and then rely on time updates to refresh them
    this.updateAllChips().catch(this.error);
  }

  private stopChipUpdates(): void {
    // No persistent subscriptions to clean up with polling approach
  }

  private getNSPanelConfig(): NSPanelConfig {
    const storedConfig = this.getStoreValue('nspanelConfig') as NSPanelConfig | null;
    if (storedConfig) {
      return storedConfig;
    }
    // Return default config if none stored
    return {
      chips: Array.from({ length: 6 }, () => ({
        device: '',
        capability: '',
        icon: '',
        unit: '',
      })),
      entities: Array.from({ length: 4 }, () => ({
        device: '',
        capability: '',
        icon: '',
        label: '',
      })),
    };
  }

  private async getCapabilityValueFromDevice(deviceId: string, capabilityId: string): Promise<unknown> {
    if (!this.homeyApi) {
      throw new Error('HomeyAPI not initialized');
    }

    try {
      const value = await this.homeyApi.devices.getCapabilityValue({
        deviceId,
        capabilityId,
      });
      return value;
    } catch (error) {
      this.error(`Failed to get capability ${capabilityId} from device ${deviceId}:`, error);
      throw error;
    }
  }

  private async updateAllChips(): Promise<void> {
    if (!this.connection) {
      return;
    }

    if (!this.homeyApi) {
      this.log('HomeyAPI not initialized, skipping chip updates');
      return;
    }

    const config = this.getNSPanelConfig();

    // Update chips
    for (let i = 0; i < config.chips.length; i++) {
      const chipConfig = config.chips[i];
      const chipId = `chip0${i + 1}`;

      if (chipConfig.device && chipConfig.capability) {
        try {
          const value = await this.getCapabilityValueFromDevice(chipConfig.device, chipConfig.capability);
          await this.updateChipValue(chipId, value, chipConfig);
        } catch (error) {
          this.error(`Error updating ${chipId}:`, error);
        }
      }
    }

    // Update entities
    for (let i = 0; i < config.entities.length; i++) {
      const entityConfig = config.entities[i];
      const entityId = `entity0${i + 1}`;

      if (entityConfig.device && entityConfig.capability) {
        try {
          const value = await this.getCapabilityValueFromDevice(entityConfig.device, entityConfig.capability);
          await this.updateEntityValue(entityId, value, entityConfig);
        } catch (error) {
          this.error(`Error updating ${entityId}:`, error);
        }
      }
    }
  }

  private async updateEntityValue(entityId: string, value: unknown, config: NSPanelEntityConfig): Promise<void> {
    if (!this.connection) {
      return;
    }

    // Format the value
    let displayValue: string;
    if (typeof value === 'number') {
      displayValue = value.toFixed(1);
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'On' : 'Off';
    } else if (value === null || value === undefined) {
      displayValue = '--';
    } else {
      displayValue = String(value);
    }

    this.log(`Updating ${entityId}: ${displayValue}`);

    // Update the entity value on home screen
    await this.updateHomeEntity(entityId, displayValue, config.icon || undefined);

    // If there's a custom label, update that too
    if (config.label) {
      await this.executeService('component_text', {
        page: 'home',
        id: `${entityId}_label`,
        txt: config.label,
      }).catch(() => {
        // Label component might not exist, ignore error
      });
    }
  }

  /**
   * Called when config is updated from settings page
   */
  async onConfigUpdated(): Promise<void> {
    this.log('NSPanel config updated, refreshing display...');
    await this.updateAllChips();
  }

  private async updateChipValue(chipId: string, value: unknown, config: ChipConfig): Promise<void> {
    if (!this.connection) {
      return;
    }

    // Format the value
    let displayValue: string;
    if (typeof value === 'number') {
      // Round to 1 decimal place for numbers
      displayValue = value.toFixed(1);
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'On' : 'Off';
    } else if (value === null || value === undefined) {
      displayValue = '--';
    } else {
      displayValue = String(value);
    }

    // Add unit if configured
    if (config.unit) {
      displayValue = `${displayValue}${config.unit}`;
    }

    this.log(`Updating ${chipId}: ${displayValue}`);
    await this.updateHomeEntity(chipId, displayValue, config.icon || undefined);
  }

  // Execute an ESPHome service using protobuf messages
  private async executeService(
    serviceName: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    const service = this.services.get(serviceName);
    if (!service) {
      this.error(`Service '${serviceName}' not found. Available services: ${Array.from(this.services.keys()).join(', ')}`);
      throw new Error(`Service '${serviceName}' not found`);
    }

    const message = new pb.ExecuteServiceRequest();
    message.setKey(service.key);

    // Build argument list based on service definition
    const serviceArgs: unknown[] = [];
    const argDefs = service.argsList || [];
    for (const argDef of argDefs) {
      const value = args[argDef.name];
      if (value !== undefined) {
        const arg = new pb.ExecuteServiceArgument();
        switch (argDef.type) {
          case 0: // bool
            arg.setBool(Boolean(value));
            break;
          case 1: // int
            arg.setInt(Number(value));
            break;
          case 2: // float
            arg.setFloat(Number(value));
            break;
          case 3: // string
            arg.setString(String(value));
            break;
          case 4: // bool[]
            arg.setBoolArrayList(value as unknown as boolean[]);
            break;
          case 5: // int[]
            arg.setIntArrayList(value as unknown as number[]);
            break;
          case 6: // float[]
            arg.setFloatArrayList(value as unknown as number[]);
            break;
          case 7: // string[]
            arg.setStringArrayList(value as unknown as string[]);
            break;
          default:
            arg.setString(String(value));
        }
        serviceArgs.push(arg);
      }
    }
    message.setArgsList(serviceArgs);

    this.connection.sendMessage(message);
  }

  // Public methods for flow actions
  async showNotification(heading: string, message: string, timeout: number = 10): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    await this.executeService('notification_show', {
      heading,
      message,
      icon: '',
      timeout,
    });
  }

  async clearNotification(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    await this.executeService('notification_clear', {});
  }

  async wakeUp(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    await this.executeService('wake_up', {});
  }

  async playSound(melody: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    await this.executeService('rtttl_play', { tone: melody });
  }

  async updateButton(
    page: string,
    button: string,
    options: { label?: string; state?: boolean },
  ): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    await this.executeService('button', {
      page,
      id: button,
      state: options.state ?? false,
      icon: '',
      label: options.label || '',
      bri: 100,
    });
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    await this.executeService('command', { cmd: command });
  }

  async showQRCode(content: string, heading?: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    // The qrcode service takes: qrcode (content), heading
    await this.executeService('qrcode', {
      qrcode: content,
      heading: heading || '',
    });
  }

  // Page name to ID mapping (from NSPanel HA Blueprint)
  private readonly pageIds: Record<string, number> = {
    boot: 0,
    home: 1,
    weather01: 2,
    weather02: 3,
    weather03: 4,
    weather04: 5,
    weather05: 6,
    climate: 7,
    settings: 8,
    screensaver: 9,
    light: 10,
    cover: 11,
    buttonpage01: 12,
    buttonpage02: 13,
    buttonpage03: 14,
    buttonpage04: 15,
    notification: 16,
    qrcode: 17,
    entitypage01: 18,
    entitypage02: 19,
    entitypage03: 20,
    entitypage04: 21,
    fan: 22,
    alarm: 23,
    keyb_num: 24,
    media_player: 25,
    confirm: 26,
    utilities: 27,
  };

  async gotoPage(pageName: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    const pageId = this.pageIds[pageName];
    if (pageId === undefined) {
      throw new Error(`Unknown page: ${pageName}`);
    }

    this.log(`Navigating to page: ${pageName} (ID: ${pageId})`);
    // Use the goto_page script via command service
    // The Nextion command to change page is "page <id>"
    await this.sendCommand(`page ${pageId}`);
  }

  // Weather icon mapping based on NSPanel HA Blueprint icons
  private getWeatherIcon(condition: string): string {
    const iconMap: Record<string, string> = {
      sunny: '\uE599', // mdi:weather-sunny
      'clear-night': '\uE594', // mdi:weather-night
      partlycloudy: '\uE595', // mdi:weather-partly-cloudy
      cloudy: '\uE590', // mdi:weather-cloudy
      fog: '\uE591', // mdi:weather-fog
      rainy: '\uE598', // mdi:weather-rainy
      snowy: '\uE59A', // mdi:weather-snowy
      lightning: '\uE593', // mdi:weather-lightning
      windy: '\uE59D', // mdi:weather-windy
      pouring: '\uE596', // mdi:weather-pouring
      'snowy-rainy': '\uE59B', // mdi:weather-snowy-rainy
      hail: '\uE592', // mdi:weather-hail
    };
    return iconMap[condition] || iconMap.sunny;
  }

  async updateWeather(temperature: string, condition: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    // Update the outdoor temperature on home page
    await this.executeService('component_text', {
      page: 'home',
      id: 'outdoor_temp',
      txt: `${temperature}°`,
    });

    // Update the weather icon on home page
    const icon = this.getWeatherIcon(condition);
    await this.executeService('component_text', {
      page: 'home',
      id: 'weather_icon',
      txt: icon,
    });
  }

  async updateHomeEntity(entity: string, value: string, icon?: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    // Update the text/value of the entity
    await this.executeService('component_text', {
      page: 'home',
      id: entity,
      txt: value,
    });

    // Update icon if provided
    if (icon) {
      // For chips, the icon component is typically entity_icon or similar
      const iconId = entity.startsWith('chip') ? `${entity}_icon` : entity;
      await this.executeService('component_text', {
        page: 'home',
        id: iconId,
        txt: icon,
      });
    }
  }

  async onSettings({ changedKeys }: {
    oldSettings: HomeySettings;
    newSettings: HomeySettings;
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('Settings changed:', changedKeys);

    // Reconnect if connection settings changed
    if (changedKeys.includes('host') || changedKeys.includes('port')
        || changedKeys.includes('password') || changedKeys.includes('encryptionKey')) {
      // Disconnect and reconnect with new settings
      this.disconnect();
      // Settings are already updated by Homey at this point
      await this.connect();
      return;
    }

    // Restart weather updates if weather settings changed
    if (changedKeys.includes('weatherEnabled') || changedKeys.includes('weatherUpdateInterval')) {
      this.startWeatherUpdates();
    }

    // Update time/date immediately if format settings changed
    if (changedKeys.includes('dateFormat') || changedKeys.includes('timeFormat')) {
      await this.updateTimeAndDate();
    }
  }

  private disconnect(): void {
    this.stopTimeUpdates();
    this.stopWeatherUpdates();
    this.stopChipUpdates();

    if (this.reconnectTimer) {
      this.homey.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    this.connection = null;
  }

  async onDeleted(): Promise<void> {
    this.log('Device deleted, cleaning up');
    this.disconnect();
  }
}

module.exports = NSPanelDevice;
