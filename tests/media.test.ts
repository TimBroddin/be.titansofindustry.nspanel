import { describe, expect, test } from 'bun:test';
import { normalizeConfig } from '../lib/config';
import { timerLabels } from '../lib/i18n';
import {
  MediaSelection, PlayerState, appLabel, extrapolatePosition, formatDuration,
} from '../lib/media/selection';
import { buildMediaProps } from '../lib/panel/mediaView';
import icons from '../lib/icons.json';

const SONOS_CAPS = ['speaker_playing', 'speaker_next', 'speaker_prev', 'speaker_track', 'speaker_artist', 'speaker_position', 'speaker_duration', 'volume_set', 'volume_mute'];
const APPLE_CAPS = ['speaker_playing', 'speaker_track', 'speaker_artist', 'speaker_position', 'speaker_duration', 'volume_up', 'volume_down', 'volume_mute'];

const player = (id: string, over: Partial<PlayerState> = {}): PlayerState => ({
  deviceId: id, name: id, app: 'com.sonos', caps: SONOS_CAPS, iconGlyph: 'I',
  playing: false, track: '', artist: '', position: null, duration: null, volume: null, positionAt: 0, ...over,
});
const states = (...ps: PlayerState[]) => new Map(ps.map((p) => [p.deviceId, p]));

describe('MediaSelection', () => {
  const sel = () => new MediaSelection(['keuken', 'woonkamer', 'tv']);

  test('first playing player in list order wins, else the last active one, else the first', () => {
    const s = sel();
    expect(s.choose(states(player('keuken'), player('woonkamer'), player('tv')))).toBe('keuken');
    expect(s.choose(states(player('keuken'), player('woonkamer', { playing: true }), player('tv', { playing: true })))).toBe('woonkamer');
    expect(s.choose(states(player('keuken'), player('woonkamer'), player('tv')))).toBe('woonkamer'); // last active sticks
  });

  test('manual choice sticks until another player starts playing', () => {
    const s = sel();
    const playingKeuken = states(player('keuken', { playing: true }), player('woonkamer'), player('tv'));
    expect(s.choose(playingKeuken)).toBe('keuken');
    expect(s.next(playingKeuken)).toBe('woonkamer');
    expect(s.choose(playingKeuken)).toBe('woonkamer');
    expect(s.next(playingKeuken)).toBe('tv');
    expect(s.next(playingKeuken)).toBe('keuken'); // wraps
    s.next(playingKeuken); // -> woonkamer
    expect(s.choose(states(player('keuken', { playing: true }), player('woonkamer'), player('tv', { playing: true })))).toBe('tv');
  });

  test('players missing from Homey are skipped; empty list gives null', () => {
    expect(sel().choose(states(player('tv', { playing: true })))).toBe('tv');
    expect(new MediaSelection([]).choose(states())).toBeNull();
  });
});

describe('position and labels', () => {
  test('position runs on while playing, capped at duration', () => {
    expect(extrapolatePosition(player('a', { playing: true, position: 50, duration: 140, positionAt: 1000 }), 4500)).toBe(53.5);
    expect(extrapolatePosition(player('a', { playing: true, position: 139, duration: 140, positionAt: 0 }), 10000)).toBe(140);
    expect(extrapolatePosition(player('a', { playing: false, position: 50, positionAt: 0 }), 10000)).toBe(50);
    expect(extrapolatePosition(player('a', { position: null }), 10000)).toBeNull();
  });

  test('durations and app labels', () => {
    expect([formatDuration(53), formatDuration(140), formatDuration(3725)]).toEqual(['0:53', '2:20', '1:02:05']);
    expect([appLabel('com.sonos'), appLabel('com.basmilius.apple'), appLabel('nl.philips.hue')]).toEqual(['Sonos', 'Apple', 'Hue']);
  });

  test('timer labels per language (9, in firmware order)', () => {
    expect(timerLabels('nl')).toEqual(['loopt · klaar om', 'gepauzeerd', 'Klaar!', 'Start', 'Pauze', 'Verder', 'Stop', 'Reset', 'Timer']);
    expect(timerLabels('en')[0]).toBe('running · ready at');
  });

  test('config: media players are unique non-empty ids', () => {
    expect(normalizeConfig({ media: { players: ['a', '', 'b', 'a', 3] } }).media).toEqual({ players: ['a', 'b'] });
    expect(normalizeConfig({}).media).toEqual({ players: [] });
  });
});

describe('buildMediaProps', () => {
  const PICS = { home: 49, homeOn: 56, media: 57, mediaBare: 58 };
  const glyph = (n: string) => (icons as Record<string, string>)[n];

  test('Sonos: full controls, progress, volume, pause glyph while playing, home button amber', () => {
    const p = buildMediaProps({
      lang: 'nl', now: 4000, pics: PICS, anyPlaying: true, coverShown: false,
      player: player('keuken', { name: 'Keuken', playing: true, track: 'Help!', artist: 'The Beatles', position: 50, duration: 140, positionAt: 1000, volume: 0.55 }),
    });
    expect(p['media.player.txt']).toBe('Keuken »');
    expect(p['media.src.txt']).toBe('SONOS · KEUKEN');
    expect([p['media.track.txt'], p['media.artist.txt']]).toEqual(['Help!', 'The Beatles']);
    expect([p['media.pos.txt'], p['media.dur.txt'], p['media.prog.val'], p['media.prog.vis']]).toEqual(['0:53', '2:20', '38', '1']);
    expect(p['media.pp.txt']).toBe(glyph('pause'));
    expect([p['media.prev_b.picc'], p['media.next_b.picc']]).toEqual(['57', '57']);
    expect([p['media.vol.val'], p['media.vol.vis']]).toEqual(['55', '1']);
    expect(p['media.cover_ic.txt']).toBe('I');
    expect(p['home.nav_med.picc']).toBe('56');
  });

  test('Apple TV style: no previous/next (bare picture), no volume bar; play glyph when paused; cover hides the icon', () => {
    const p = buildMediaProps({
      lang: 'en', now: 0, pics: PICS, anyPlaying: false, coverShown: true,
      player: player('tv', { name: 'Living AppleTV', app: 'com.basmilius.apple', caps: APPLE_CAPS, track: 'Severance' }),
    });
    expect([p['media.prev_b.picc'], p['media.next_b.picc'], p['media.vol.vis']]).toEqual(['58', '58', '0']);
    expect(p['media.pp.txt']).toBe(glyph('play'));
    expect([p['media.pos.txt'], p['media.dur.txt'], p['media.prog.vis']]).toEqual(['', '', '0']);
    expect(p['media.cover_ic.txt']).toBe('');
    expect(p['home.nav_med.picc']).toBe('49');
  });

  test('no player configured', () => {
    const p = buildMediaProps({ lang: 'nl', now: 0, pics: PICS, anyPlaying: false, coverShown: false, player: null });
    expect([p['media.track.txt'], p['media.player.txt'], p['media.src.txt']]).toEqual(['Geen speler', '', '']);
  });

  test('without picture ids no picc props are sent', () => {
    const p = buildMediaProps({ lang: 'nl', now: 0, pics: null, anyPlaying: true, coverShown: false, player: player('k') });
    expect(Object.keys(p).some((k) => k.endsWith('.picc'))).toBe(false);
  });
});
