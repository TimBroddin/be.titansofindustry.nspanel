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

  // Emits 'fatal' (message) instead of throwing when the connection cannot be set up at all.
  start(): void {
    this.stop();
    if (!this.opts.encryptionKey) {
      this.emit('fatal', 'Encryption key required');
      return;
    }
    let client: any;
    try {
      client = new Client({
        host: this.opts.host,
        port: this.opts.port || 6053,
        encryptionKey: this.opts.encryptionKey,
        reconnect: true,
        reconnectInterval: 5000,
        pingInterval: 15000,
        pingAttempts: 3,
      });
    } catch (err) {
      this.emit('fatal', `Invalid encryption key: ${(err as Error).message}`);
      return;
    }
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
