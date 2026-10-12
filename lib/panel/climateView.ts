import { Lang, formatNumber, t } from '../i18n';

export interface ThermostatInfo { name: string; zone: string; min: number; max: number; step: number }

export interface ClimateState {
  lang: Lang;
  current: number | null;
  target: number | null;
  thermostat: ThermostatInfo | null;
  outside: number | null;
}

const tenths = (v: number): string => String(Math.round(v * 10));

export function buildClimateProps(s: ClimateState): Record<string, string> {
  const { lang } = s;
  const deg = (v: number, d: number): string => `${formatNumber(v, d, lang)}°`;
  const p: Record<string, string> = {
    'climate.title.txt': t(lang, 'climate'),
    'climate.tgt_lbl.txt': t(lang, 'target').toUpperCase(),
    'climate.tgt_txt.txt': s.target === null ? '--' : deg(s.target, 1),
    'climate.room_lbl.txt': (s.thermostat?.zone ?? '').toUpperCase(),
    'climate.room.txt': s.thermostat?.name ?? '',
    'climate.info.txt': s.outside === null ? '' : `${t(lang, 'outside')} ${deg(Math.round(s.outside), 0)}`,
  };

  if (!s.thermostat) {
    p['climate.status.txt'] = t(lang, 'noThermostat');
    return p;
  }
  const heating = s.target !== null && s.current !== null && s.target > s.current + 0.05;
  const now = s.current === null ? '' : ` · ${t(lang, 'now')} ${deg(s.current, 1)}`;
  p['climate.status.txt'] = `${t(lang, heating ? 'heating' : 'atTemp')}${now}`;

  if (s.target !== null) {
    p['climate.tgt.val'] = tenths(s.target);
    p['climate.tmin.val'] = tenths(s.thermostat.min);
    p['climate.tmax.val'] = tenths(s.thermostat.max);
    p['climate.tstep.val'] = tenths(s.thermostat.step);
    p['climate.dsep.txt'] = lang === 'nl' ? ',' : '.';
  }
  return p;
}
