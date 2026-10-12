'use strict';

interface NSPanelConfig {
  chips: Array<{
    device: string;
    capability: string;
    icon: string;
    unit: string;
  }>;
  entities: Array<{
    device: string;
    capability: string;
    icon: string;
    label: string;
  }>;
}

interface HomeyDevice {
  name: string;
  driverId: string;
  zone?: string;
  capabilities: string[];
  capabilitiesObj: Record<string, unknown>;
  store: Record<string, unknown>;
}

// Use 'any' for homey parameter since the API handler receives
// a Homey instance but the types are complex to import correctly
/* eslint-disable @typescript-eslint/no-explicit-any */
module.exports = {
  /**
   * GET /devices
   * Returns all Homey devices for the settings page device pickers
   */
  async getDevices({ homey }: { homey: any }): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    // Get devices from all drivers in this app
    const drivers = homey.drivers.getDrivers();

    for (const driver of Object.values(drivers) as any[]) {
      const driverDevices = driver.getDevices();
      for (const device of driverDevices) {
        const data = device.getData();
        const id = data?.id || device.id;
        result[id] = {
          id,
          name: device.getName(),
          driverId: driver.id,
          capabilities: device.getCapabilities(),
          capabilitiesObj: {},
          store: device.getStore() || {},
        };
      }
    }

    // Also get devices from other apps via Homey Web API
    try {
      homey.app.log('Fetching devices from Homey Web API...');
      const { HomeyAPI } = require('homey-api');
      const api = await HomeyAPI.createAppAPI({ homey });

      // Get zones/rooms first
      const zones = await api.zones.getZones();
      homey.app.log(`Got ${Object.keys(zones).length} zones from Homey Web API`);

      const allDevices = await api.devices.getDevices();
      homey.app.log(`Got ${Object.keys(allDevices).length} devices from Homey Web API`);

      for (const [id, device] of Object.entries(allDevices) as [string, HomeyDevice][]) {
        if (!result[id]) {
          // Get zone name for this device
          const zone = device.zone ? zones[device.zone] : null;
          const zoneName = zone?.name || '';

          result[id] = {
            id,
            name: device.name,
            zoneName,
            zoneId: device.zone || '',
            driverId: device.driverId,
            capabilities: device.capabilities || [],
            capabilitiesObj: device.capabilitiesObj || {},
            store: {},
          };
        }
      }
    } catch (err) {
      // API access to other devices might fail, that's ok - we have our own devices
      homey.app.log('Could not get devices from Homey Web API:', err);
    }

    return result;
  },

  /**
   * PUT /nspanel/:deviceId/config
   * Saves the NSPanel configuration to the device store
   */
  async putNspanelConfig({
    homey,
    params,
    body,
  }: {
    homey: any;
    params: { deviceId: string };
    body: NSPanelConfig;
  }): Promise<{ success: boolean }> {
    const { deviceId } = params;
    const config = body;

    // Get the nspanel driver
    const driver = homey.drivers.getDriver('nspanel');
    const devices = driver.getDevices();

    // Find the device by ID
    const device = devices.find((d: any) => d.getData().id === deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // Save config to device store
    await device.setStoreValue('nspanelConfig', config);

    // Trigger config update on device if it has such a method
    if (typeof device.onConfigUpdated === 'function') {
      await device.onConfigUpdated();
    }

    homey.app.log(`Saved config for NSPanel device ${deviceId}`);
    return { success: true };
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
