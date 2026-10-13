'use strict';

// Splits a device's capabilities for the chip picker: on/off-style ones first.
// Shared by settings/index.html (browser global) and tests (CommonJS).

function groupCapabilities(device) {
  const obj = device.capabilitiesObj || {};
  const items = (device.capabilities || []).map((id) => ({ id, title: (obj[id] && obj[id].title) || id, type: obj[id] && obj[id].type }));
  const rank = (c) => (c.id === 'onoff' ? 0 : c.id.startsWith('alarm_') ? 1 : 2); // eslint-disable-line no-nested-ternary
  const byRankThenTitle = (a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title);
  const strip = ({ id, title }) => ({ id, title });
  return {
    suggested: items.filter((c) => c.type === 'boolean').sort(byRankThenTitle).map(strip),
    other: items.filter((c) => c.type !== 'boolean').sort((a, b) => a.title.localeCompare(b.title)).map(strip),
  };
}

if (typeof module !== 'undefined') module.exports = { groupCapabilities };
