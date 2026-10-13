'use strict';

// Shared by settings/index.html (browser global) and tests (CommonJS).
// Builds the target dropdown for a mood tile. A stored id that is no longer listed (deleted, or the
// list failed to load) stays selectable as "(missing: id)", so saving never drops the tile silently.

function targetChoices(type, data, selectedId, selectedAdvanced) {
  const none = { value: '', label: '—' };
  let list = [];
  if (type === 'mood') list = data.moods.map((m) => ({ value: m.id, name: m.name, label: m.zone ? `${m.zone} · ${m.name}` : m.name }));
  else if (type === 'flow') {
    list = data.flows.map((f) => ({
      value: f.id, name: f.name, label: f.advanced ? `${f.name} (advanced)` : f.name, advanced: f.advanced,
    }));
  } else if (type === 'toggle') list = data.toggles.map((d) => ({ value: d.id, name: d.name, label: d.zone ? `${d.zone} · ${d.name}` : d.name }));
  else return [{ value: '', label: '(use the "Mood tile pressed" flow card)' }];

  if (selectedId && !list.some((c) => c.value === selectedId)) {
    const missing = { value: selectedId, label: `(missing: ${selectedId})` };
    if (type === 'flow') missing.advanced = Boolean(selectedAdvanced);
    list.unshift(missing);
  }
  return [none, ...list];
}

// Label after picking a new target: follow the target's name unless the user typed their own.
function nextLabel(currentLabel, previousDefault, newDefault) {
  const current = String(currentLabel || '').trim();
  return !current || current === previousDefault ? newDefault : currentLabel;
}

// Key of a device's own icon in the panel's Homey icon font. Must match scripts/icon-font/fetch-device-icons.ts:
// "homey:app:nl.philips.hue:bulb" -> "device-icons/nl.philips.hue/bulb".
function deviceIconKey(driverId) {
  const parts = String(driverId || '').split(':');
  const name = parts.length >= 4 ? `${parts[2]}/${parts.slice(3).join('-')}` : parts.slice(1).join('/');
  return `device-icons/${name}`;
}

// Icon after picking a device: keep a chosen icon, otherwise the device's own icon if the panel font has it.
function defaultIcon(currentIcon, driverId, icons) {
  if (currentIcon) return currentIcon;
  return icons[deviceIconKey(driverId)] || '';
}

if (typeof module !== 'undefined') module.exports = {
  targetChoices, nextLabel, deviceIconKey, defaultIcon,
};
