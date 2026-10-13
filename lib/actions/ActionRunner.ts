import { DashboardConfig } from '../config';
import { PlayerState } from '../media/selection';
import { UiEvent } from '../panel/uiEvents';

export interface HomeyActions {
  setMood(moodId: string): Promise<void>;
  triggerFlow(flowId: string, advanced: boolean): Promise<void>;
  setCapability(deviceId: string, capability: string, value: unknown): Promise<void>;
  getCapability(deviceId: string, capability: string): unknown;
  fireTileTrigger(tile: number, label: string): Promise<void>;
}

export interface MediaControl {
  active(): PlayerState | null; // the player the media page shows
  nextPlayer(): void; // "player »" tapped
}

export interface ThermostatTarget { deviceId: string; min: number; max: number; step: number }

// momentaryTile: the tile showed "on" for a one-shot action; turn it off again shortly.
// revertTile: put the tile back to its real state (action failed or tile is empty).
// revertClimate: the panel shows a target Homey did not accept; resend the real one.
// mediaChanged: the shown player changed (re-render, new cover). timerFinished: the firmware timer ran out.
export interface ActionResult {
  momentaryTile?: number; revertTile?: number; revertClimate?: boolean; mediaChanged?: boolean; timerFinished?: boolean; error?: string;
}

const VOLUME_STEP = 0.05;

export function parseTarget(arg: string, t: ThermostatTarget): number | null {
  if (!/^\d+$/.test(arg)) return null;
  const raw = Number(arg) / 10;
  const stepped = t.step > 0 ? Math.round(raw / t.step) * t.step : raw;
  return Math.min(t.max, Math.max(t.min, Math.round(stepped * 100) / 100));
}

export class ActionRunner {
  constructor(
    private readonly config: () => DashboardConfig,
    private readonly homey: HomeyActions,
    private readonly thermostat: () => ThermostatTarget | null,
    private readonly error: (...args: unknown[]) => void,
    private readonly media: MediaControl | null = null,
  ) {}

  async handle(ev: UiEvent): Promise<ActionResult> {
    if (ev.type !== 'touch') return {};
    if (ev.page === 'moods' && ev.action === 'tile') return this.tile(ev.component);
    if (ev.page === 'climate' && ev.action === 'target') return this.target(ev.component);
    if (ev.page === 'media') return this.mediaAction(ev.action, ev.component);
    if (ev.page === 'timer' && ev.action === 'finished') return { timerFinished: true };
    return {};
  }

  private async mediaAction(action: string, arg: string): Promise<ActionResult> {
    if (!this.media) return {};
    if (action === 'player') {
      this.media.nextPlayer();
      return { mediaChanged: true };
    }
    const p = this.media.active();
    if (!p) return {};
    const has = (cap: string): boolean => p.caps.includes(cap);
    const set = (cap: string, value: unknown): Promise<void> => this.homey.setCapability(p.deviceId, cap, value);
    try {
      if (action === 'toggle' && has('speaker_playing')) await set('speaker_playing', !p.playing);
      else if (action === 'next' && has('speaker_next')) await set('speaker_next', true);
      else if (action === 'prev' && has('speaker_prev')) await set('speaker_prev', true);
      else if (action === 'vol') {
        const up = Number(arg) > 0;
        if (has('volume_set')) {
          const v = Math.min(1, Math.max(0, (p.volume ?? 0) + (up ? VOLUME_STEP : -VOLUME_STEP)));
          await set('volume_set', Math.round(v * 100) / 100);
        } else if (has(up ? 'volume_up' : 'volume_down')) {
          await set(up ? 'volume_up' : 'volume_down', true);
        }
      }
      return {};
    } catch (err) {
      this.error(`Media ${action} failed:`, err);
      return { error: (err as Error).message ?? String(err) };
    }
  }

  private async tile(arg: string): Promise<ActionResult> {
    const n = Number(arg);
    if (!Number.isInteger(n) || n < 1) return {};
    const index = n - 1;
    const tile = this.config().moods[index];
    if (!tile) return { revertTile: index };

    this.homey.fireTileTrigger(n, tile.label).catch((err) => this.error('Tile trigger failed:', err));
    try {
      switch (tile.type) {
        case 'mood': await this.homey.setMood(tile.moodId); return { momentaryTile: index };
        case 'flow': await this.homey.triggerFlow(tile.flowId, tile.advanced); return { momentaryTile: index };
        case 'toggle': {
          const on = this.homey.getCapability(tile.deviceId, 'onoff') === true;
          await this.homey.setCapability(tile.deviceId, 'onoff', !on);
          return {};
        }
        default: return { momentaryTile: index };
      }
    } catch (err) {
      this.error(`Tile ${n} action failed:`, err);
      return { revertTile: index, error: (err as Error).message ?? String(err) };
    }
  }

  private async target(arg: string): Promise<ActionResult> {
    const t = this.thermostat();
    const value = t ? parseTarget(arg, t) : null;
    if (!t || value === null) return { revertClimate: true };
    try {
      await this.homey.setCapability(t.deviceId, 'target_temperature', value);
      return {};
    } catch (err) {
      this.error('Setting target failed:', err);
      return { revertClimate: true, error: (err as Error).message ?? String(err) };
    }
  }
}
