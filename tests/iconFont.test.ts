import { expect, test } from 'bun:test';

const PY = 'scripts/icon-font/.venv/bin/python';

test('icon font helpers: duplicate ids renamed (first kept), white detection', () => {
  const code = [
    'import sys; sys.path.insert(0, "scripts/icon-font")',
    'from build import dedupe_ids, is_white',
    'print(dedupe_ids(\'<path id="a"/><path id="a"/><path id="b"/><path id="a"/>\'))',
    'print(is_white("#FFFFFF"), is_white("white"), is_white("#f5f5f5"), is_white("#000"), is_white("none"))',
  ].join('\n');
  const r = Bun.spawnSync([PY, '-c', code]);
  expect(r.stderr.toString().split('\n').filter((l) => l && !l.includes('Warning')).join('\n')).toBe('');
  expect(r.stdout.toString()).toBe('<path id="a"/><path id="a__dup2"/><path id="b"/><path id="a__dup3"/>\nTrue True True False False\n');
});
