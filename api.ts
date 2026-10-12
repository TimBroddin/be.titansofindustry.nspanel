'use strict';

import { DashboardConfig, loadConfig, normalizeConfig } from './lib/config';
import icons from './lib/icons.json';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires, global-require */

function findPanel(homey: any, deviceId: string): any {
  const device = homey.drivers.getDriver('nspanel').getDevices().find((d: any) => d.getData().id === deviceId);
  if (!device) throw new Error(`NSPanel ${deviceId} not found`);
  return device;
}

module.exports = {
  async getDevices({ homey }: { homey: any }): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const device of homey.drivers.getDriver('nspanel').getDevices()) {
      const { id } = device.getData();
      result[id] = {
        id, name: device.getName(), zoneName: '', driverId: 'nspanel', capabilities: [], capabilitiesObj: {},
      };
    }
    const { HomeyAPI } = require('homey-api');
    const api = await HomeyAPI.createAppAPI({ homey });
    const [zones, devices] = await Promise.all([api.zones.getZones(), api.devices.getDevices()]);
    for (const [id, d] of Object.entries(devices) as [string, any][]) {
      if (result[id]) continue;
      result[id] = {
        id,
        name: d.name,
        zoneName: zones[d.zone]?.name ?? '',
        driverId: d.driverId,
        capabilities: d.capabilities ?? [],
        capabilitiesObj: Object.fromEntries(Object.entries(d.capabilitiesObj ?? {})
          .map(([c, o]: [string, any]) => [c, { title: o?.title ?? c, units: o?.units ?? '' }])),
      };
    }
    return result;
  },

  async getIcons(): Promise<Record<string, string>> {
    return icons;
  },

  async getConfig({ homey, params }: { homey: any; params: { deviceId: string } }): Promise<DashboardConfig> {
    const device = findPanel(homey, params.deviceId);
    return loadConfig({ dashboardConfig: device.getStoreValue('dashboardConfig'), nspanelConfig: device.getStoreValue('nspanelConfig') });
  },

  async putConfig({ homey, params, body }: { homey: any; params: { deviceId: string }; body: unknown }): Promise<DashboardConfig> {
    const device = findPanel(homey, params.deviceId);
    const config = normalizeConfig(body);
    await device.setStoreValue('dashboardConfig', config);
    await device.onConfigUpdated();
    return config;
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires, global-require */
