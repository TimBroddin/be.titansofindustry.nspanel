import { Client, Connection } from 'esphome-native-api';
import { EventEmitter } from 'events';

export interface NSPanelButtonEvent {
  type: 'button_click';
  page: string;
  component: string;
  command: 'short_click' | 'long_click' | 'release';
}

export interface NSPanelConfig {
  host: string;
  port?: number;
  password?: string;
  encryptionKey?: string;
}

export interface NSPanelEntity {
  id: string;
  name: string;
  type: string;
  key: number;
  state?: unknown;
}

export class ESPHomeNSPanelClient extends EventEmitter {
  private client: Client;
  private connection: Connection | null = null;
  private entities: Map<number, NSPanelEntity> = new Map();
  private connected = false;
  private config: NSPanelConfig;

  constructor(config: NSPanelConfig) {
    super();
    this.config = config;
    this.client = new Client({
      host: config.host,
      port: config.port ?? 6053,
      password: config.password,
      encryptionKey: config.encryptionKey,
      reconnect: true,
      reconnectInterval: 30000,
      pingInterval: 15000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connected', (connection: Connection) => {
      this.connection = connection;
      this.connected = true;
      this.emit('connected');

      // Subscribe to logs to capture button events
      // NSPanel fires events via fire_homeassistant_event which may appear in logs
      connection.subscribeLogsService({ level: 3, dumpConfig: false });
    });

    this.client.on('disconnected', () => {
      this.connected = false;
      this.connection = null;
      this.emit('disconnected');
    });

    this.client.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.client.on('deviceInfo', (info: Record<string, unknown>) => {
      this.emit('deviceInfo', info);
    });

    this.client.on('newEntity', (entity: Record<string, unknown>) => {
      const nspanelEntity: NSPanelEntity = {
        id: String(entity.id || entity.objectId || ''),
        name: String(entity.name || ''),
        type: String(entity.type || ''),
        key: Number(entity.key || 0),
      };
      this.entities.set(nspanelEntity.key, nspanelEntity);
      this.emit('entity', nspanelEntity);

      // Set up state change listener for binary sensors (physical buttons)
      if (entity.type === 'BinarySensor') {
        const entityObj = entity as { on?: (event: string, handler: (state: unknown) => void) => void };
        entityObj.on?.('state', (state: unknown) => {
          const stateObj = state as { state?: boolean };
          // Physical button state change
          if (nspanelEntity.name.toLowerCase().includes('left') ||
              nspanelEntity.name.toLowerCase().includes('right')) {
            this.handlePhysicalButtonState(nspanelEntity.name, stateObj.state ?? false);
          }
        });
      }
    });

    // Listen for logs that might contain button events
    this.client.on('logs', (log: { message?: string }) => {
      this.parseLogForButtonEvents(log.message || '');
    });
  }

  private handlePhysicalButtonState(buttonName: string, pressed: boolean): void {
    const button = buttonName.toLowerCase().includes('left') ? 'hw_bt_left' : 'hw_bt_right';
    // We emit a simplified event - the actual click detection (short/long)
    // is handled by the NSPanel firmware
    this.emit('physicalButton', {
      button,
      pressed,
    });
  }

  private parseLogForButtonEvents(message: string): void {
    // The NSPanel logs button events before firing them
    // Format: "hw_bt_left" "short_click" or similar
    if (message.includes('button_click')) {
      // Try to extract button info from log message
      const match = message.match(/page:\s*(\w+).*component:\s*(\w+).*command:\s*(\w+)/i);
      if (match) {
        const event: NSPanelButtonEvent = {
          type: 'button_click',
          page: match[1],
          component: match[2],
          command: match[3] as 'short_click' | 'long_click' | 'release',
        };
        this.emit('buttonClick', event);
      }
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.client.connect();
    });
  }

  disconnect(): void {
    this.client.disconnect();
    this.connected = false;
    this.connection = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getEntities(): NSPanelEntity[] {
    return Array.from(this.entities.values());
  }

  // Call an ESPHome action on the NSPanel
  async callAction(action: string, data: Record<string, unknown>): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to NSPanel');
    }

    // Convert action name and data to ESPHome service format
    await this.connection.executeService({
      service: action,
      data: this.convertToServiceData(data),
    });
  }

  private convertToServiceData(data: Record<string, unknown>): Record<string, unknown>[] {
    // Convert object to array of {type, value} pairs for ESPHome service calls
    return Object.entries(data).map(([key, value]) => {
      if (typeof value === 'string') {
        return { [key]: { stringValue: value } };
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          return { [key]: { intValue: value } };
        }
        return { [key]: { floatValue: value } };
      } else if (typeof value === 'boolean') {
        return { [key]: { boolValue: value } };
      } else if (Array.isArray(value)) {
        // For color arrays [r, g, b]
        return { [key]: { intArrayValue: value } };
      }
      return { [key]: value };
    });
  }

  // NSPanel-specific actions
  async wakeUp(): Promise<void> {
    await this.callAction('wake_up', {});
  }

  async showNotification(
    heading: string,
    message: string,
    options?: {
      icon?: string;
      iconColor?: [number, number, number];
      timeout?: number;
    }
  ): Promise<void> {
    await this.callAction('notification_show', {
      heading,
      message,
      icon: options?.icon || '',
      icon_color: options?.iconColor || [255, 255, 255],
      timeout: options?.timeout || 10,
    });
  }

  async clearNotification(): Promise<void> {
    await this.callAction('notification_clear', {});
  }

  async updateButton(
    page: string,
    buttonId: string,
    options: {
      state?: boolean;
      icon?: string;
      iconColor?: [number, number, number];
      label?: string;
      brightness?: number;
    }
  ): Promise<void> {
    await this.callAction('button', {
      page,
      id: buttonId,
      state: options.state ?? false,
      icon: options.icon || '',
      icon_color: options.iconColor || [255, 255, 255],
      label: options.label || '',
      bri: options.brightness ?? 100,
    });
  }

  async updateWeather(
    page: string,
    options: {
      icon?: string;
      temperature?: string;
      humidity?: string;
      windSpeed?: string;
    }
  ): Promise<void> {
    // Update weather components on the home page
    if (options.icon) {
      await this.callAction('component_text', {
        page,
        id: 'weather_icon',
        txt: options.icon,
      });
    }
    if (options.temperature) {
      await this.callAction('component_text', {
        page,
        id: 'outdoor_temp',
        txt: options.temperature,
      });
    }
  }

  async playRtttl(melody: string): Promise<void> {
    await this.callAction('rtttl_play', { tone: melody });
  }

  async sendDisplayCommand(command: string): Promise<void> {
    await this.callAction('command', { cmd: command });
  }
}
