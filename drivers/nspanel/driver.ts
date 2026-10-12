'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import Homey from 'homey';

interface PairDevice {
  name: string;
  data: {
    id: string;
  };
  settings: {
    host: string;
    port: number;
    password: string;
    encryptionKey: string;
  };
}

interface NSPanelDevice extends Homey.Device {
  showNotification(heading: string, message: string, timeout: number): Promise<void>;
  clearNotification(): Promise<void>;
  wakeUp(): Promise<void>;
  playSound(melody: string): Promise<void>;
  gotoPage(page: string): Promise<void>;
}

class NSPanelDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('NSPanel driver initialized');

    this.homey.flow.getDeviceTriggerCard('physical_button_pressed')
      .registerRunListener(async (args, state) => (args.button === 'any' || args.button === state.button)
        && (args.action === 'any' || args.action === state.action));

    const action = (id: string, run: (device: NSPanelDevice, args: Record<string, any>) => Promise<void>): void => {
      this.homey.flow.getActionCard(id).registerRunListener(async (args) => run(args.device as NSPanelDevice, args));
    };
    action('show_notification', (d, a) => d.showNotification(a.heading, a.message, a.timeout || 10));
    action('clear_notification', (d) => d.clearNotification());
    action('wake_up', (d) => d.wakeUp());
    action('play_sound', (d, a) => d.playSound(a.melody));
    action('goto_page', (d, a) => d.gotoPage(a.page));
  }

  async onPairListDevices(): Promise<PairDevice[]> {
    this.log('Listing devices using Homey discovery...');

    const discoveryStrategy = this.getDiscoveryStrategy();
    const discoveryResults = discoveryStrategy.getDiscoveryResults();

    this.log('Discovery results:', Object.keys(discoveryResults).length);

    const devices: PairDevice[] = Object.values(discoveryResults).map((result) => {
      // Homey's DiscoveryResultMDNSSD has port as string
      const mdnsResult = result as { id: string; address: string; port: string; name: string };
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
