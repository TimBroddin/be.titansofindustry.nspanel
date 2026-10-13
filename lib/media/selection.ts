// Which media player the panel shows, and small helpers for its state.

export interface PlayerState {
  deviceId: string;
  name: string;
  app: string; // Homey app id, e.g. "com.sonos"
  caps: string[];
  iconGlyph: string; // the device's own icon in the panel's Homey icon font ('' if none)
  playing: boolean;
  track: string;
  artist: string;
  position: number | null; // seconds, as last reported
  duration: number | null; // seconds
  volume: number | null; // 0..1
  positionAt: number; // ms timestamp when `position` was reported
}

export class MediaSelection {
  private manual: string | null = null;
  private playingWhenManual = new Set<string>();
  private last: string | null = null;

  constructor(private readonly order: string[]) {}

  // Manual choice wins until a player starts playing that wasn't playing when it was made; then that one
  // is shown. Otherwise: the first playing player in list order, else the last shown, else the first.
  choose(states: ReadonlyMap<string, PlayerState>): string | null {
    const present = this.order.filter((id) => states.has(id));
    const playing = present.filter((id) => states.get(id)!.playing);
    if (this.manual && states.has(this.manual)) {
      const started = playing.find((id) => !this.playingWhenManual.has(id) && id !== this.manual);
      if (!started) return this.manual;
      this.manual = null;
      this.last = started;
      return started;
    }
    const pick = playing[0] ?? (this.last && states.has(this.last) ? this.last : present[0] ?? null);
    if (pick) this.last = pick;
    return pick;
  }

  next(states: ReadonlyMap<string, PlayerState>): string | null {
    const present = this.order.filter((id) => states.has(id));
    if (!present.length) return null;
    const current = this.choose(states);
    const pick = present[(present.indexOf(current ?? present[0]) + 1) % present.length];
    this.manual = pick;
    this.last = pick;
    this.playingWhenManual = new Set(present.filter((id) => states.get(id)!.playing));
    return pick;
  }
}

export function extrapolatePosition(p: PlayerState, now: number): number | null {
  if (p.position === null) return null;
  if (!p.playing) return p.position;
  const pos = p.position + (now - p.positionAt) / 1000;
  return p.duration !== null ? Math.min(p.duration, pos) : pos;
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// "com.sonos" -> "Sonos", "com.basmilius.apple" -> "Apple"
export function appLabel(appId: string): string {
  const last = appId.split('.').pop() ?? appId;
  return last.charAt(0).toUpperCase() + last.slice(1);
}
