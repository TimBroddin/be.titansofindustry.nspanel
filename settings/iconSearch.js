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

// Homey icon keys look like "homey-vectors/io.nuki.smartlock/lock_nuki"; MDI names like "light-switch".
const HOMEY_SUGGESTED_DIR = 'homey capability Icons/';

function searchIcons(query, names, limit) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    const mdi = SUGGESTED_ICONS.filter((n) => names.includes(n));
    return (mdi.length ? mdi : names.filter((n) => n.includes(HOMEY_SUGGESTED_DIR))).slice(0, limit);
  }
  const score = (key) => {
    const n = key.toLowerCase();
    const name = n.slice(n.lastIndexOf('/') + 1); // the icon itself, without the app folder
    const words = name.split(/[-_ .]+/).filter(Boolean);
    const allWords = n.split(/[-_/ .]+/).filter(Boolean);
    if (name === q) return 0;
    if (words[0] === q) return 1; // "light" → light-switch before lightbulb
    if (name.startsWith(q)) return 2;
    if (allWords.some((w) => w.startsWith(q))) return 3;
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
