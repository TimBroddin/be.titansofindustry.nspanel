declare module 'esphome-native-api' {
  import { EventEmitter } from 'events';

  export interface ClientConfig {
    host: string;
    port?: number;
    password?: string;
    encryptionKey?: string;
    reconnect?: boolean;
    reconnectInterval?: number;
    pingInterval?: number;
    pingAttempts?: number;
  }

  export interface Connection {
    connected: boolean;
    subscribeLogsService(options: { level: number; dumpConfig: boolean }): void;
    executeService(options: { service: string; data: unknown[] }): Promise<void>;
  }

  export interface Entity {
    name: string;
    key: number;
    type: string;
    on(event: string, handler: (state: unknown) => void): void;
  }

  export interface DeviceInfo {
    name: string;
    macAddress: string;
    esphomeVersion: string;
    compilationTime: string;
    model: string;
    hasDeepSleep: boolean;
    projectName: string;
    projectVersion: string;
  }

  export interface LogMessage {
    level: number;
    message: string;
  }

  export class Client extends EventEmitter {
    constructor(config: ClientConfig);
    connected: boolean;
    connection: Connection;
    connect(): void;
    disconnect(): void;

    on(event: 'connected', listener: () => void): this;
    on(event: 'disconnected', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'deviceInfo', listener: (info: Record<string, unknown>) => void): this;
    on(event: 'newEntity', listener: (entity: Entity) => void): this;
    on(event: 'logs', listener: (log: LogMessage) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export interface DiscoveredDevice {
    name: string;
    host: string;
    port: number;
    address: string[];
  }

  export class Discovery extends EventEmitter {
    constructor();
    run(): void;
    close(): void;

    on(event: 'info', listener: (info: DiscoveredDevice) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }
}
