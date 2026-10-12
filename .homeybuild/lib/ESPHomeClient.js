"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESPHomeNSPanelClient = void 0;
const esphome_native_api_1 = require("esphome-native-api");
const events_1 = require("events");
class ESPHomeNSPanelClient extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.connection = null;
        this.entities = new Map();
        this.connected = false;
        this.config = config;
        this.client = new esphome_native_api_1.Client({
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
    setupEventHandlers() {
        this.client.on('connected', (connection) => {
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
        this.client.on('error', (error) => {
            this.emit('error', error);
        });
        this.client.on('deviceInfo', (info) => {
            this.emit('deviceInfo', info);
        });
        this.client.on('newEntity', (entity) => {
            const nspanelEntity = {
                id: String(entity.id || entity.objectId || ''),
                name: String(entity.name || ''),
                type: String(entity.type || ''),
                key: Number(entity.key || 0),
            };
            this.entities.set(nspanelEntity.key, nspanelEntity);
            this.emit('entity', nspanelEntity);
            // Set up state change listener for binary sensors (physical buttons)
            if (entity.type === 'BinarySensor') {
                const entityObj = entity;
                entityObj.on?.('state', (state) => {
                    const stateObj = state;
                    // Physical button state change
                    if (nspanelEntity.name.toLowerCase().includes('left') ||
                        nspanelEntity.name.toLowerCase().includes('right')) {
                        this.handlePhysicalButtonState(nspanelEntity.name, stateObj.state ?? false);
                    }
                });
            }
        });
        // Listen for logs that might contain button events
        this.client.on('logs', (log) => {
            this.parseLogForButtonEvents(log.message || '');
        });
    }
    handlePhysicalButtonState(buttonName, pressed) {
        const button = buttonName.toLowerCase().includes('left') ? 'hw_bt_left' : 'hw_bt_right';
        // We emit a simplified event - the actual click detection (short/long)
        // is handled by the NSPanel firmware
        this.emit('physicalButton', {
            button,
            pressed,
        });
    }
    parseLogForButtonEvents(message) {
        // The NSPanel logs button events before firing them
        // Format: "hw_bt_left" "short_click" or similar
        if (message.includes('button_click')) {
            // Try to extract button info from log message
            const match = message.match(/page:\s*(\w+).*component:\s*(\w+).*command:\s*(\w+)/i);
            if (match) {
                const event = {
                    type: 'button_click',
                    page: match[1],
                    component: match[2],
                    command: match[3],
                };
                this.emit('buttonClick', event);
            }
        }
    }
    async connect() {
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
    disconnect() {
        this.client.disconnect();
        this.connected = false;
        this.connection = null;
    }
    isConnected() {
        return this.connected;
    }
    getEntities() {
        return Array.from(this.entities.values());
    }
    // Call an ESPHome action on the NSPanel
    async callAction(action, data) {
        if (!this.connection) {
            throw new Error('Not connected to NSPanel');
        }
        // Convert action name and data to ESPHome service format
        await this.connection.executeService({
            service: action,
            data: this.convertToServiceData(data),
        });
    }
    convertToServiceData(data) {
        // Convert object to array of {type, value} pairs for ESPHome service calls
        return Object.entries(data).map(([key, value]) => {
            if (typeof value === 'string') {
                return { [key]: { stringValue: value } };
            }
            else if (typeof value === 'number') {
                if (Number.isInteger(value)) {
                    return { [key]: { intValue: value } };
                }
                return { [key]: { floatValue: value } };
            }
            else if (typeof value === 'boolean') {
                return { [key]: { boolValue: value } };
            }
            else if (Array.isArray(value)) {
                // For color arrays [r, g, b]
                return { [key]: { intArrayValue: value } };
            }
            return { [key]: value };
        });
    }
    // NSPanel-specific actions
    async wakeUp() {
        await this.callAction('wake_up', {});
    }
    async showNotification(heading, message, options) {
        await this.callAction('notification_show', {
            heading,
            message,
            icon: options?.icon || '',
            icon_color: options?.iconColor || [255, 255, 255],
            timeout: options?.timeout || 10,
        });
    }
    async clearNotification() {
        await this.callAction('notification_clear', {});
    }
    async updateButton(page, buttonId, options) {
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
    async updateWeather(page, options) {
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
    async playRtttl(melody) {
        await this.callAction('rtttl_play', { tone: melody });
    }
    async sendDisplayCommand(command) {
        await this.callAction('command', { cmd: command });
    }
}
exports.ESPHomeNSPanelClient = ESPHomeNSPanelClient;
