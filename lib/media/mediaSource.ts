// Live state of the configured media players (any Homey device with speaker_* capabilities) and which one
// the panel shows.
import { CapabilityInstance, WatchableDevice } from '../sources/CapabilitySource';
import { MediaSelection, PlayerState, extrapolatePosition } from './selection';

export interface PlayerDevice extends WatchableDevice {
  id: string;
  name?: string;
  driverId?: string;
  capabilities?: string[];
}

export interface PlayerProvider { getDevice(deviceId: string): Promise<PlayerDevice> }

interface DeviceImage { id?: string; type?: string; imageObj?: { url?: string; lastUpdated?: number } | null }

const WATCHED = ['speaker_playing', 'speaker_track', 'speaker_artist', 'speaker_album', 'speaker_position', 'speaker_duration', 'volume_set'];
const TRACK_CAPS = new Set(['speaker_track', 'speaker_artist', 'speaker_album']);

// Same as deviceIconKey in settings/moodOptions.js: "homey:app:com.sonos:cloud" -> "device-icons/com.sonos/cloud".
export function deviceIconKey(driverId: string): string {
  const parts = String(driverId || '').split(':');
  const name = parts.length >= 4 ? `${parts[2]}/${parts.slice(3).join('-')}` : parts.slice(1).join('/');
  return `device-icons/${name}`;
}

// The album art image of a speaker device; `key` changes whenever the image does.
export function albumArt(images: DeviceImage[] | undefined | null): { url: string; key: string } | null {
  const img = (images ?? []).find((i) => i.id === 'albumart' || i.type === 'media');
  const url = img?.imageObj?.url;
  return url ? { url, key: `${url}@${img?.imageObj?.lastUpdated ?? 0}` } : null;
}

const appOf = (driverId: string): string => String(driverId || '').split(':')[2] ?? '';
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class MediaSource {
  readonly states = new Map<string, PlayerState>();
  private instances: CapabilityInstance[] = [];
  private selection = new MediaSelection([]);
  private shown: string | null = null;
  private generation = 0;

  constructor(
    private readonly devices: PlayerProvider,
    private readonly iconGlyph: (driverId: string) => string,
    private readonly onChange: (trackChanged: boolean) => void,
    private readonly now: () => number = Date.now,
    private readonly error: (...args: unknown[]) => void = () => {},
  ) {}

  async setPlayers(ids: string[]): Promise<void> {
    const gen = ++this.generation;
    this.stopWatching();
    this.selection = new MediaSelection(ids);
    for (const id of ids) {
      try {
        const device = await this.devices.getDevice(id);
        if (gen !== this.generation) return;
        this.add(device);
      } catch (err) {
        this.error(`Media player ${id} unavailable:`, err);
      }
    }
    if (gen === this.generation) this.changed(false);
  }

  active(): PlayerState | null {
    const id = this.selection.choose(this.states);
    return id ? this.states.get(id) ?? null : null;
  }

  anyPlaying(): boolean {
    return [...this.states.values()].some((p) => p.playing);
  }

  nextPlayer(): void {
    this.selection.next(this.states);
    this.changed(false);
  }

  destroy(): void {
    this.generation++;
    this.stopWatching();
  }

  private stopWatching(): void {
    this.instances.forEach((i) => i.destroy());
    this.instances = [];
    this.states.clear();
  }

  private add(device: PlayerDevice): void {
    const caps = device.capabilities ?? Object.keys(device.capabilitiesObj ?? {});
    const value = (cap: string): unknown => device.capabilitiesObj?.[cap]?.value;
    const state: PlayerState = {
      deviceId: device.id,
      name: device.name ?? device.id,
      app: appOf(device.driverId ?? ''),
      caps,
      iconGlyph: this.iconGlyph(device.driverId ?? ''),
      playing: value('speaker_playing') === true,
      track: str(value('speaker_track')),
      artist: str(value('speaker_artist')),
      position: numOrNull(value('speaker_position')),
      duration: numOrNull(value('speaker_duration')),
      volume: numOrNull(value('volume_set')),
      positionAt: this.now(),
    };
    this.states.set(device.id, state);
    for (const cap of WATCHED.filter((c) => caps.includes(c))) {
      this.instances.push(device.makeCapabilityInstance(cap, (v) => this.update(state, cap, v)));
    }
  }

  private update(p: PlayerState, cap: string, v: unknown): void {
    const now = this.now();
    switch (cap) {
      case 'speaker_playing':
        p.position = extrapolatePosition(p, now); // freeze (pause) or restart (play) the clock at the current spot
        p.positionAt = now;
        p.playing = v === true;
        break;
      case 'speaker_track': p.track = str(v); break;
      case 'speaker_artist': p.artist = str(v); break;
      case 'speaker_position': p.position = numOrNull(v); p.positionAt = now; break;
      case 'speaker_duration': p.duration = numOrNull(v); break;
      case 'volume_set': p.volume = numOrNull(v); break;
      default: break;
    }
    this.changed(TRACK_CAPS.has(cap) && this.active()?.deviceId === p.deviceId);
  }

  private changed(trackChanged: boolean): void {
    const shown = this.active()?.deviceId ?? null;
    const switched = shown !== this.shown;
    this.shown = shown;
    this.onChange(trackChanged || switched);
  }
}
