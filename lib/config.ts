export const CHIP_SLOTS = 7;
export const VALUE_SLOTS = 4;
export const MOOD_SLOTS = 8;
export const MAX_CALENDAR_DAYS = 14;

export interface ChipConfig { deviceId: string; capability: string; icon: string }
export interface ValueConfig { deviceId: string; capability: string; icon: string; unit: string }
export type ButtonMode = 'relay' | 'event';

interface TileBase { icon: string; label: string }
export type MoodTile =
  | (TileBase & { type: 'mood'; moodId: string })
  | (TileBase & { type: 'flow'; flowId: string; advanced: boolean })
  | (TileBase & { type: 'toggle'; deviceId: string })
  | (TileBase & { type: 'trigger' });

export interface CalendarConfig { url: string; daysAhead: number }
export interface ScreenConfig { screensaverMinutes: number; screensaverBrightness: number }

export interface DashboardConfig {
  version: 1;
  home: {
    thermostat: { deviceId: string } | null;
    chips: Array<ChipConfig | null>;
    values: Array<ValueConfig | null>;
  };
  buttons: { left: ButtonMode; right: ButtonMode };
  moods: Array<MoodTile | null>;
  calendar: CalendarConfig | null;
  screen: ScreenConfig;
}

export interface CapabilityRef { deviceId: string; capability: string }

type Obj = Record<string, unknown>;

export const capKey = (deviceId: string, capability: string): string => `${deviceId}:${capability}`;

const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const mode = (v: unknown): ButtonMode => (v === 'event' ? 'event' : 'relay');

// The old settings page stored icons as the 6-character text "\uE335" instead of the glyph.
const decodeIcon = (v: unknown): string => str(v).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

function slots<T>(raw: unknown, count: number, parse: (item: Obj) => T | null): Array<T | null> {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => (arr[i] && typeof arr[i] === 'object' ? parse(arr[i] as Obj) : null));
}

function parseChip(item: Obj): ChipConfig | null {
  const deviceId = str(item.deviceId);
  const capability = str(item.capability);
  return deviceId && capability ? { deviceId, capability, icon: decodeIcon(item.icon) } : null;
}

function parseValue(item: Obj): ValueConfig | null {
  const deviceId = str(item.deviceId);
  const capability = str(item.capability);
  return deviceId && capability ? {
    deviceId, capability, icon: decodeIcon(item.icon), unit: str(item.unit),
  } : null;
}

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
};

function parseTile(item: Obj): MoodTile | null {
  const base = { icon: decodeIcon(item.icon), label: str(item.label) };
  switch (item.type) {
    case 'mood': return str(item.moodId) ? { type: 'mood', moodId: str(item.moodId), ...base } : null;
    case 'flow': return str(item.flowId) ? { type: 'flow', flowId: str(item.flowId), advanced: item.advanced === true, ...base } : null;
    case 'toggle': return str(item.deviceId) ? { type: 'toggle', deviceId: str(item.deviceId), ...base } : null;
    case 'trigger': return { type: 'trigger', ...base };
    default: return null;
  }
}

function parseCalendar(raw: unknown): CalendarConfig | null {
  const c = obj(raw);
  const url = str(c.url).trim();
  return url ? { url, daysAhead: int(c.daysAhead, 1, MAX_CALENDAR_DAYS, 7) } : null;
}

export function normalizeConfig(raw: unknown): DashboardConfig {
  const r = obj(raw);
  const home = obj(r.home);
  const buttons = obj(r.buttons);
  const thermostatId = str(obj(home.thermostat).deviceId);
  return {
    version: 1,
    home: {
      thermostat: thermostatId ? { deviceId: thermostatId } : null,
      chips: slots(home.chips, CHIP_SLOTS, parseChip),
      values: slots(home.values, VALUE_SLOTS, parseValue),
    },
    buttons: { left: mode(buttons.left), right: mode(buttons.right) },
    moods: slots(r.moods, MOOD_SLOTS, parseTile),
    calendar: parseCalendar(r.calendar),
    screen: {
      screensaverMinutes: int(obj(r.screen).screensaverMinutes, 0, 240, 0),
      screensaverBrightness: int(obj(r.screen).screensaverBrightness, 0, 100, 10),
    },
  };
}

export const defaultConfig = (): DashboardConfig => normalizeConfig({});

export function migrateLegacy(legacy: unknown): DashboardConfig {
  const l = obj(legacy);
  const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
  return normalizeConfig({
    home: {
      chips: list(l.chips).map((c) => ({ deviceId: c.device, capability: c.capability, icon: c.icon })),
      values: list(l.entities).map((e) => ({
        deviceId: e.device, capability: e.capability, icon: e.icon, unit: '',
      })),
    },
  });
}

export function loadConfig(store: { dashboardConfig?: unknown; nspanelConfig?: unknown }): DashboardConfig {
  if (store.dashboardConfig) return normalizeConfig(store.dashboardConfig);
  if (store.nspanelConfig) return migrateLegacy(store.nspanelConfig);
  return defaultConfig();
}

export function watchedCapabilities(config: DashboardConfig): CapabilityRef[] {
  // Value fields are kept in the schema for old configs but no longer shown, so not watched.
  const refs: CapabilityRef[] = config.home.chips
    .filter((s): s is ChipConfig => s !== null)
    .map(({ deviceId, capability }) => ({ deviceId, capability }));
  for (const tile of config.moods) {
    if (tile?.type === 'toggle') refs.push({ deviceId: tile.deviceId, capability: 'onoff' });
  }
  const t = config.home.thermostat;
  if (t) {
    refs.push({ deviceId: t.deviceId, capability: 'measure_temperature' }, { deviceId: t.deviceId, capability: 'target_temperature' });
  }
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = capKey(r.deviceId, r.capability);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
