import { DashboardConfig, capKey } from '../config';
import {
  Lang, formatNumber, formatValue, isActive,
} from '../i18n';
import { WeatherNow, weatherPicture } from '../weather';

export const ICON_THERMOMETER = '\uE50E';

export interface HomeState {
  lang: Lang;
  dateText: string;
  values: ReadonlyMap<string, unknown>;
  weather: WeatherNow | null;
  panelTemperature: number | null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function buildHomeProps(config: DashboardConfig, state: HomeState): Record<string, string> {
  const { lang } = state;
  const get = (deviceId: string, capability: string): unknown => state.values.get(capKey(deviceId, capability));
  const p: Record<string, string> = {};

  // Blackymas home chrome that this dashboard does not use.
  for (let i = 1; i <= 7; i++) p[`home.button${pad(i)}.vis`] = '0';
  for (const id of ['bt_notific', 'bt_qrcode', 'bt_entities', 'bt_utilities']) p[`home.${id}.vis`] = '0';
  for (const id of ['wifi_icon', 'bt_icon', 'chip_climate', 'left_bt_text', 'right_bt_text']) p[`home.${id}.txt`] = '';

  p['home.date.txt'] = state.dateText;

  if (state.weather) {
    p['home.outdoor_temp.txt'] = `${formatNumber(Math.round(state.weather.temperature), 0, lang)}°`;
    p['home.weather.pic'] = String(weatherPicture(state.weather.code, state.weather.isDay));
    p['home.weather.vis'] = '1';
  } else {
    p['home.outdoor_temp.txt'] = '';
    p['home.weather.vis'] = '0';
  }

  const { thermostat } = config.home;
  const current = thermostat ? get(thermostat.deviceId, 'measure_temperature') : undefined;
  const indoor = typeof current === 'number' ? current : state.panelTemperature;
  p['home.indr_temp.txt'] = typeof indoor === 'number' ? `${formatNumber(indoor, 1, lang)}°` : '';
  p['home.indr_temp_icon.txt'] = typeof indoor === 'number' ? ICON_THERMOMETER : '';

  config.home.chips.forEach((chip, i) => {
    p[`home.chip${pad(i + 1)}.txt`] = chip && isActive(get(chip.deviceId, chip.capability)) ? chip.icon : '';
  });

  config.home.values.forEach((v, i) => {
    const n = pad(i + 1);
    p[`home.value${n}.txt`] = v ? formatValue(get(v.deviceId, v.capability) ?? null, { lang, unit: v.unit }) : '';
    p[`home.value${n}_icon.txt`] = v ? v.icon : '';
  });

  return p;
}
