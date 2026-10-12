import { describe, expect, test } from 'bun:test';
import { parseUiEvent } from '../lib/panel/uiEvents';

const ev = (data: Record<string, string>) => ({
  service: 'esphome.nspanel_ui', isEvent: true, dataList: Object.entries(data).map(([key, value]) => ({ key, value })),
});

describe('parseUiEvent', () => {
  test('touch', () => {
    expect(parseUiEvent(ev({ type: 'touch', page: 'home', slot: 'chip01', value: 'short_click' })))
      .toEqual({ type: 'touch', page: 'home', component: 'chip01', action: 'short_click' });
  });
  test('page', () => {
    expect(parseUiEvent(ev({ type: 'page', page: 'climate', slot: '', value: '' }))).toEqual({ type: 'page', page: 'climate' });
  });
  test('hw_button', () => {
    expect(parseUiEvent(ev({ type: 'hw_button', page: '', slot: 'right', value: 'long' })))
      .toEqual({ type: 'hw_button', button: 'right', action: 'long' });
  });
  test('ignores other events, service calls and bad payloads', () => {
    expect(parseUiEvent({ ...ev({ type: 'page', page: 'home' }), service: 'esphome.other' })).toBeNull();
    expect(parseUiEvent({ ...ev({ type: 'page', page: 'home' }), isEvent: false })).toBeNull();
    expect(parseUiEvent(ev({ type: 'hw_button', slot: 'middle', value: 'short' }))).toBeNull();
    expect(parseUiEvent(ev({ type: 'nope' }))).toBeNull();
  });
});
