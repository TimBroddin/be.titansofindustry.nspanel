export type UiEvent =
  | { type: 'touch'; page: string; component: string; action: string }
  | { type: 'page'; page: string }
  | { type: 'hw_button'; button: 'left' | 'right'; action: 'short' | 'long' };

export interface HaActionMessage { service?: string; isEvent?: boolean; dataList?: Array<{ key: string; value: string }> }

export const UI_EVENT_NAME = 'esphome.nspanel_ui';

export function parseUiEvent(msg: HaActionMessage): UiEvent | null {
  if (!msg.isEvent || msg.service !== UI_EVENT_NAME) return null;
  const d: Record<string, string> = {};
  for (const { key, value } of msg.dataList ?? []) d[key] = value;
  switch (d.type) {
    case 'touch': return {
      type: 'touch', page: d.page ?? '', component: d.slot ?? '', action: d.value ?? '',
    };
    case 'page': return d.page ? { type: 'page', page: d.page } : null;
    case 'hw_button':
      if ((d.slot === 'left' || d.slot === 'right') && (d.value === 'short' || d.value === 'long')) {
        return { type: 'hw_button', button: d.slot, action: d.value };
      }
      return null;
    default: return null;
  }
}
