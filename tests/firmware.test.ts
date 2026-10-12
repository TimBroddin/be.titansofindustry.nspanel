import { expect, test } from 'bun:test';

test('PropCache: sends to the visible page, resends unchanged values, replays others on page open', async () => {
  const bin = '/tmp/nspanel-propcache-test';
  const cc = Bun.spawnSync(['clang++', '-std=c++17', '-o', bin, 'tests/firmware/propcache_test.cpp']);
  expect(cc.stderr.toString()).toBe('');
  const out = Bun.spawnSync([bin]).stdout.toString();
  expect(out).toBe([
    '--set', 'i01.picc=3',
    '--same value again (panel flipped it locally)', 'i01.picc=3',
    '--other page',
    '--open home', 'date.txt="ma 12 \\"okt\\"\\rx"',
    '',
  ].join('\n'));
});
