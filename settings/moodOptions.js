'use strict';

// Shared by settings/index.html (browser global) and tests (CommonJS).
// Builds the target dropdown for a mood tile. A stored id that is no longer listed (deleted, or the
// list failed to load) stays selectable as "(missing: id)", so saving never drops the tile silently.

function targetChoices(type, data, selectedId, selectedAdvanced) {
  const none = { value: '', label: '—' };
  let list = [];
  if (type === 'mood') list = data.moods.map((m) => ({ value: m.id, label: m.zone ? `${m.zone} · ${m.name}` : m.name }));
  else if (type === 'flow') list = data.flows.map((f) => ({ value: f.id, label: f.advanced ? `${f.name} (advanced)` : f.name, advanced: f.advanced }));
  else if (type === 'toggle') list = data.toggles.map((d) => ({ value: d.id, label: d.zone ? `${d.zone} · ${d.name}` : d.name }));
  else return [{ value: '', label: '(use the "Mood tile pressed" flow card)' }];

  if (selectedId && !list.some((c) => c.value === selectedId)) {
    const missing = { value: selectedId, label: `(missing: ${selectedId})` };
    if (type === 'flow') missing.advanced = Boolean(selectedAdvanced);
    list.unshift(missing);
  }
  return [none, ...list];
}

if (typeof module !== 'undefined') module.exports = { targetChoices };
