import { DashboardConfig } from '../config';
import { Lang, t } from '../i18n';
import { pad2 } from './text';

export interface TilePictures { off: number; on: number }

export function buildMoodsProps(config: DashboardConfig, states: boolean[], lang: Lang, pics: TilePictures | null): Record<string, string> {
  const p: Record<string, string> = { 'moods.title.txt': t(lang, 'moods') };
  config.moods.forEach((tile, i) => {
    const n = pad2(i + 1);
    p[`moods.i${n}.txt`] = tile?.icon ?? '';
    p[`moods.l${n}.txt`] = tile?.label ?? '';
    if (pics) {
      const pic = String(tile && states[i] ? pics.on : pics.off);
      p[`moods.i${n}.picc`] = pic;
      p[`moods.l${n}.picc`] = pic;
    }
  });
  return p;
}
