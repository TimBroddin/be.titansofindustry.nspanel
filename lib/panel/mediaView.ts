import { Lang, t } from '../i18n';
import icons from '../icons.json';
import {
  PlayerState, appLabel, extrapolatePosition, formatDuration,
} from '../media/selection';
import { truncate } from './text';

export interface MediaPictures { home: number; homeOn: number; media: number; mediaBare: number }

export interface MediaViewState {
  lang: Lang;
  now: number;
  player: PlayerState | null;
  anyPlaying: boolean; // any configured player: lights up the home media button
  coverShown: boolean; // the firmware has (or is drawing) a cover: hide the placeholder icon
  pics: MediaPictures | null;
}

const MDI = icons as Record<string, string>;

export function buildMediaProps(s: MediaViewState): Record<string, string> {
  const p: Record<string, string> = { 'media.title.txt': 'Media' };
  if (s.pics) p['home.nav_med.picc'] = String(s.anyPlaying ? s.pics.homeOn : s.pics.home);
  const pl = s.player;
  if (!pl) {
    Object.assign(p, {
      'media.player.txt': '',
      'media.src.txt': '',
      'media.track.txt': t(s.lang, 'noPlayer'),
      'media.artist.txt': '',
      'media.pos.txt': '',
      'media.dur.txt': '',
      'media.prog.vis': '0',
      'media.vol.vis': '0',
      'media.cover_ic.txt': '',
      'media.pp.txt': '',
    });
    return p;
  }
  const has = (cap: string): boolean => pl.caps.includes(cap);
  const pos = extrapolatePosition(pl, s.now);
  const timed = pos !== null && pl.duration !== null && pl.duration > 0;

  p['media.player.txt'] = `${truncate(pl.name, 14)} »`;
  p['media.src.txt'] = `${appLabel(pl.app)} · ${pl.name}`.toUpperCase();
  p['media.track.txt'] = truncate(pl.track, 26);
  p['media.artist.txt'] = truncate(pl.artist, 34);
  p['media.pos.txt'] = timed ? formatDuration(pos as number) : '';
  p['media.dur.txt'] = timed ? formatDuration(pl.duration as number) : '';
  p['media.prog.val'] = timed ? String(Math.round(((pos as number) / (pl.duration as number)) * 100)) : '0';
  p['media.prog.vis'] = timed ? '1' : '0';
  p['media.pp.txt'] = pl.playing ? MDI.pause : MDI.play;
  p['media.vol.val'] = String(Math.round((pl.volume ?? 0) * 100));
  p['media.vol.vis'] = has('volume_set') ? '1' : '0';
  p['media.cover_ic.txt'] = s.coverShown ? '' : pl.iconGlyph;
  if (s.pics) {
    p['media.prev_b.picc'] = String(has('speaker_prev') ? s.pics.media : s.pics.mediaBare);
    p['media.next_b.picc'] = String(has('speaker_next') ? s.pics.media : s.pics.mediaBare);
  }
  return p;
}
