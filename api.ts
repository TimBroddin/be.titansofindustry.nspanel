'use strict';

import { DashboardConfig, loadConfig, normalizeConfig } from './lib/config';
import homeyIcons from './lib/homeyIcons.json';
import { fetchCalendar, parseUpcoming } from './lib/sources/calendar';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires, global-require */

async function appApi(homey: any): Promise<any> {
  const { HomeyAPI } = require('homey-api');
  return HomeyAPI.createAppAPI({ homey });
}

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
        iconUrl: d.iconObj?.url ?? null,
        capabilities: d.capabilities ?? [],
        capabilitiesObj: Object.fromEntries(Object.entries(d.capabilitiesObj ?? {})
          .map(([c, o]: [string, any]) => [c, { title: o?.title ?? c, units: o?.units ?? '', type: o?.type ?? '' }])),
      };
    }
    return result;
  },

  // Icons a chip or mood tile can use: the Homey icon font on the panel (lib/homeyIcons.json).
  async getIcons(): Promise<Record<string, string>> {
    return homeyIcons;
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

  async getMoods({ homey }: { homey: any }): Promise<Array<{ id: string; name: string; zone: string }>> {
    const api = await appApi(homey);
    const [moods, zones] = await Promise.all([api.moods.getMoods(), api.zones.getZones()]);
    return Object.values(moods as Record<string, any>)
      .map((m) => ({ id: m.id, name: m.name, zone: zones[m.zone]?.name ?? '' }))
      .sort((a, b) => (a.zone + a.name).localeCompare(b.zone + b.name));
  },

  async getFlows({ homey }: { homey: any }): Promise<Array<{ id: string; name: string; advanced: boolean }>> {
    const api = await appApi(homey);
    const [flows, advanced] = await Promise.all([api.flow.getFlows(), api.flow.getAdvancedFlows()]);
    return [
      ...Object.values(flows as Record<string, any>).map((f) => ({ id: f.id, name: f.name, advanced: false })),
      ...Object.values(advanced as Record<string, any>).map((f) => ({ id: f.id, name: f.name, advanced: true })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  },

  async postCalendarTest({ homey, body }: { homey: any; body: { url?: string } }): Promise<Array<{ start: string; allDay: boolean; title: string }>> {
    const ics = await fetchCalendar(String(body?.url ?? '').trim());
    return parseUpcoming(ics, new Date(), 14, homey.clock.getTimezone())
      .slice(0, 5)
      .map((e) => ({ start: e.start.toISOString(), allDay: e.allDay, title: e.title }));
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires, global-require */
