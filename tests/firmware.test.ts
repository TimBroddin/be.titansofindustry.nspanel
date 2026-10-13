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

test('timer state machine and cover cache', async () => {
  const bin = '/tmp/nspanel-timer-cover-test';
  const cc = Bun.spawnSync(['clang++', '-std=c++17', '-o', bin, 'tests/firmware/timer_cover_test.cpp']);
  expect(cc.stderr.toString()).toBe('');
  expect(Bun.spawnSync([bin]).stdout.toString()).toBe([
    '--idle',
    'timer.remain.txt=00:00', 'timer.status.txt=', 'timer.act_lbl.txt=Start', 'timer.rst_lbl.txt=Reset', 'home.tmr.txt=',
    '--add 5 min at t=0 starts it',
    'timer.remain.txt=04:59', 'timer.status.txt=running · ready at 13:47', 'timer.act_lbl.txt=Pause', 'timer.rst_lbl.txt=Reset', 'home.tmr.txt=Timer 04:59',
    '--pause at 61s, add 60 while paused',
    'timer.remain.txt=04:59', 'timer.status.txt=paused', 'timer.act_lbl.txt=Resume', 'timer.rst_lbl.txt=Reset', 'home.tmr.txt=Timer 04:59',
    '--resume at 100s, finishes at 399s',
    'tick 398999: 0', 'tick 399000: 1', 'tick 400000: 0',
    'timer.remain.txt=00:00', 'timer.status.txt=Done!', 'timer.act_lbl.txt=Stop', 'timer.rst_lbl.txt=Reset', 'home.tmr.txt=Done!',
    '--stop',
    'timer.remain.txt=00:00', 'timer.status.txt=', 'timer.act_lbl.txt=Start', 'timer.rst_lbl.txt=Reset', 'home.tmr.txt=',
    '--set 90s without start, then reset',
    'timer.remain.txt=01:30', 'timer.status.txt=', 'timer.act_lbl.txt=Start', 'timer.rst_lbl.txt=Reset', 'home.tmr.txt=Timer 01:30',
    'mode 0',
    '--cover',
    '1001',
    'fill 20,62,96,1,65535', 'fill 21,63,4,2,31',
    'size after begin 0',
    '',
  ].join('\n'));
});
