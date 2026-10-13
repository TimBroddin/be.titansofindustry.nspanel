'use strict';

// Icon picker search. Shared by settings/index.html (browser global) and tests (CommonJS).

const SUGGESTED_ICONS = [
  'lightbulb', 'lightbulb-outline', 'ceiling-light', 'lamp', 'floor-lamp', 'led-strip', 'lightbulb-group',
  'door-open', 'door-closed', 'window-open', 'window-closed', 'garage', 'lock', 'lock-open', 'motion-sensor',
  'thermometer', 'thermostat', 'fire', 'snowflake', 'fan', 'air-conditioner', 'water', 'water-percent',
  'washing-machine', 'tumble-dryer', 'dishwasher', 'power-plug', 'flash', 'television', 'speaker', 'music',
  'movie-open', 'silverware-fork-knife', 'bed', 'sofa', 'home', 'home-outline', 'weather-night', 'palette',
  'party-popper', 'power', 'bell', 'car', 'robot-vacuum',
];

function searchIcons(query, names, limit) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return SUGGESTED_ICONS.filter((n) => names.includes(n)).slice(0, limit);
  const score = (n) => {
    const words = n.split('-');
    if (n === q) return 0;
    if (words[0] === q) return 1; // "light" → light-switch before lightbulb
    if (n.startsWith(q)) return 2;
    if (words.some((w) => w.startsWith(q))) return 3;
    if (n.includes(q)) return 4;
    return -1;
  };
  return names
    .map((n) => [n, score(n)])
    .filter(([, s]) => s >= 0)
    .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([n]) => n);
}

if (typeof module !== 'undefined') module.exports = { searchIcons, SUGGESTED_ICONS };
