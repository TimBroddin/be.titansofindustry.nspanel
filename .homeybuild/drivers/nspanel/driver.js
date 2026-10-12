'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
class NSPanelDriver extends homey_1.default.Driver {
    async onInit() {
        this.log('NSPanel driver initialized');
        this.registerFlowCards();
    }
    registerFlowCards() {
        // Register trigger cards
        this.homey.flow.getDeviceTriggerCard('button_pressed')
            .registerRunListener(async (args, state) => {
            const buttonMatch = args.button === 'any'
                || args.button === `${state.page}.${state.component}`
                || args.button === state.component;
            const actionMatch = args.action === 'any' || args.action === state.command;
            return buttonMatch && actionMatch;
        });
        this.homey.flow.getDeviceTriggerCard('physical_button_pressed')
            .registerRunListener(async (args, state) => {
            const buttonMatch = args.button === 'any' || args.button === state.button;
            const actionMatch = args.action === 'any' || args.action === state.action;
            return buttonMatch && actionMatch;
        });
        // Register action cards
        this.homey.flow.getActionCard('show_notification')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.showNotification(args.heading, args.message, args.timeout || 10);
        });
        this.homey.flow.getActionCard('clear_notification')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.clearNotification();
        });
        this.homey.flow.getActionCard('wake_up')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.wakeUp();
        });
        this.homey.flow.getActionCard('play_sound')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.playSound(args.melody);
        });
        this.homey.flow.getActionCard('update_button')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.updateButton(args.page, args.button, {
                label: args.label,
                state: args.state,
            });
        });
        this.homey.flow.getActionCard('update_weather')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.updateWeather(args.temperature, args.condition);
        });
        this.homey.flow.getActionCard('update_home_entity')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.updateHomeEntity(args.entity, args.value, args.icon || undefined);
        });
        this.homey.flow.getActionCard('goto_page')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.gotoPage(args.page);
        });
        this.homey.flow.getActionCard('show_qrcode')
            .registerRunListener(async (args) => {
            const device = args.device;
            await device.showQRCode(args.content, args.heading || undefined);
        });
    }
    async onPairListDevices() {
        this.log('Listing devices using Homey discovery...');
        const discoveryStrategy = this.getDiscoveryStrategy();
        const discoveryResults = discoveryStrategy.getDiscoveryResults();
        this.log('Discovery results:', Object.keys(discoveryResults).length);
        const devices = Object.values(discoveryResults).map((result) => {
            // Homey's DiscoveryResultMDNSSD has port as string
            const mdnsResult = result;
            const port = parseInt(mdnsResult.port, 10) || 6053;
            this.log('Found device:', mdnsResult.name, mdnsResult.address, port);
            return {
                name: mdnsResult.name || `ESPHome (${mdnsResult.address})`,
                data: {
                    id: mdnsResult.id,
                },
                settings: {
                    host: mdnsResult.address,
                    port,
                    password: '',
                    encryptionKey: '',
                },
            };
        });
        this.log(`Returning ${devices.length} devices`);
        return devices;
    }
}
module.exports = NSPanelDriver;
