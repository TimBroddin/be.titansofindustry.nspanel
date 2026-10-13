import { describe, expect, test } from 'bun:test';
import { MediaSource, PlayerDevice, albumArt, deviceIconKey } from '../lib/media/mediaSource';

type Listener = (value: unknown) => void;

function fakeDevice(id: string, caps: Record<string, unknown>, driverId = 'homey:app:com.sonos:cloud') {
  const listeners = new Map<string, Listener>();
  let destroyed = 0;
  const device: PlayerDevice = {
    id,
    name: id.toUpperCase(),
    driverId,
    capabilities: Object.keys(caps),
    capabilitiesObj: Object.fromEntries(Object.entries(caps).map(([k, value]) => [k, { value }])),
    makeCapabilityInstance: (cap, listener) => {
      listeners.set(cap, listener);
      return { destroy: () => { destroyed++; } };
    },
  };
  return { device, emit: (cap: string, v: unknown) => listeners.get(cap)?.(v), destroyed: () => destroyed };
}

describe('MediaSource', () => {
  const setup = async (ids = ['k', 'w']) => {
    let now = 1000;
    const k = fakeDevice('k', { speaker_playing: false, speaker_track: 'A', speaker_artist: 'X', speaker_position: 10, speaker_duration: 100, volume_set: 0.3 });
    const w = fakeDevice('w', { speaker_playing: false, speaker_track: '', speaker_position: null, volume_up: null }, 'homey:app:com.basmilius.apple:apple-tv');
    const devs: Record<string, PlayerDevice> = { k: k.device, w: w.device };
    const changes: boolean[] = [];
    const src = new MediaSource(
      { getDevice: async (id) => { if (!devs[id]) throw new Error('gone'); return devs[id]; } },
      (driverId) => (driverId.includes('sonos') ? 'S' : ''),
      (trackChanged) => changes.push(trackChanged),
      () => now,
    );
    await src.setPlayers(ids);
    return { src, k, w, changes, tick: (ms: number) => { now += ms; }, at: () => now };
  };

  test('builds player state from the device', async () => {
    const { src } = await setup();
    const p = src.active()!;
    expect(p).toMatchObject({
      deviceId: 'k', name: 'K', app: 'com.sonos', iconGlyph: 'S', playing: false, track: 'A', artist: 'X', position: 10, duration: 100, volume: 0.3, positionAt: 1000,
    });
    expect(p.caps).toContain('volume_set');
  });

  test('a player that starts playing becomes active; track changes are flagged', async () => {
    const { src, w, changes } = await setup();
    w.emit('speaker_playing', true);
    expect(src.active()?.deviceId).toBe('w');
    expect(src.anyPlaying()).toBe(true);
    expect(changes.at(-1)).toBe(true); // shown player changed
    w.emit('speaker_track', 'Severance');
    expect(changes.at(-1)).toBe(true);
    w.emit('volume_mute', true); // not watched: no change
    w.emit('speaker_position', 5);
    expect(changes.at(-1)).toBe(false);
  });

  test('position timestamps follow updates; pausing freezes the extrapolated position', async () => {
    const { src, k, tick } = await setup();
    k.emit('speaker_playing', true);
    tick(4000);
    k.emit('speaker_playing', false);
    expect(src.active()).toMatchObject({ position: 14, positionAt: 5000, playing: false });
    tick(1000);
    k.emit('speaker_position', 20);
    expect(src.active()).toMatchObject({ position: 20, positionAt: 6000 });
  });

  test('next player cycles; missing devices are skipped; setPlayers replaces watchers', async () => {
    const { src, k } = await setup(['k', 'gone', 'w']);
    expect(src.active()?.deviceId).toBe('k');
    src.nextPlayer();
    expect(src.active()?.deviceId).toBe('w');
    await src.setPlayers([]);
    expect(src.active()).toBeNull();
    expect(k.destroyed()).toBeGreaterThan(0);
  });
});

describe('helpers', () => {
  test('device icon key matches the settings page', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const settings = require('../settings/moodOptions.js');
    for (const id of ['homey:app:com.sonos:cloud', 'homey:app:com.basmilius.apple:apple-tv', 'homey:manager:vdevice:x', 'homey:app:a.b:c:d']) {
      expect(deviceIconKey(id)).toBe(settings.deviceIconKey(id));
    }
  });

  test('album art: the media image with a url', () => {
    const img = { url: '/api/image/abc', lastUpdated: 5 };
    expect(albumArt([{ id: 'other', type: 'camera', imageObj: { url: '/x' } }, { id: 'albumart', type: 'media', imageObj: img }])).toEqual({ url: '/api/image/abc', key: '/api/image/abc@5' });
    expect(albumArt([{ id: 'albumart', type: 'media', imageObj: null }])).toBeNull();
    expect(albumArt(undefined)).toBeNull();
  });
});
