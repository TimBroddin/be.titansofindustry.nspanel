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

test('icon font: CSS class rules become attributes (style block removed, explicit attributes win)', () => {
  const code = [
    'import sys; sys.path.insert(0, "scripts/icon-font")',
    'from build import inline_css',
    'svg = \'<svg><defs><style>.a,.b{fill:#000;stroke:none}.c{fill:#fff}</style></defs><path class="a" d="M0 0"/><path class="c" fill="#123" d="M1 1"/><path class="b c" d="M2 2"/></svg>\'',
    'print(inline_css(svg))',
  ].join('\n');
  const r = Bun.spawnSync([PY, '-c', code]);
  expect(r.stdout.toString().trim()).toBe(
    '<svg><defs></defs><path fill="#000" stroke="none" d="M0 0"/><path fill="#123" d="M1 1"/><path fill="#fff" stroke="none" d="M2 2"/></svg>',
  );
});

test('icon font: CSS lengths with px/pt units become plain numbers', () => {
  const code = [
    'import sys; sys.path.insert(0, "scripts/icon-font")',
    'from build import inline_css',
    'print(inline_css(\'<svg><style>.s{stroke-width:1.5pt;stroke-miterlimit:4px}</style><path class="s" d="M0 0"/></svg>\'))',
  ].join('\n');
  const r = Bun.spawnSync([PY, '-c', code]);
  expect(r.stdout.toString().trim()).toBe('<svg><path stroke-width="2" stroke-miterlimit="4" d="M0 0"/></svg>');
});

test('icon font: a shape that cannot be merged is skipped instead of failing the whole icon', () => {
  const code = [
    'import sys; sys.path.insert(0, "scripts/icon-font")',
    'import pathops, build',
    'calls = []',
    'real = pathops.op',
    'def flaky(a, b, op):',
    '    calls.append(1)',
    '    if len(calls) == 2: raise pathops.PathOpsError("boom")',
    '    return real(a, b, op)',
    'build.pathops.op = flaky',
    'build.pathops.simplify = lambda p, fix_winding=True: (_ for _ in ()).throw(pathops.PathOpsError("still boom"))',
    'acc = pathops.Path(); acc.moveTo(0,0); acc.lineTo(10,0); acc.lineTo(10,10); acc.close()',
    'bad = pathops.Path(); bad.moveTo(20,20); bad.lineTo(30,20); bad.lineTo(30,30); bad.close()',
    'first = build.union(pathops.Path(), acc)',
    'out = build.union(first, bad)',
    'print(out.area, build.SKIPPED_SHAPES)',
  ].join('\n');
  const r = Bun.spawnSync([PY, '-c', code]);
  expect(r.stdout.toString().trim()).toBe('50.0 1');
});

test('icon font: px/pt units inside inline style attributes are converted too', () => {
  const code = [
    'import sys; sys.path.insert(0, "scripts/icon-font")',
    'from build import inline_css',
    'print(inline_css(\'<path style="fill:#000;stroke-width:1.5pt;stroke-opacity:1" d="M0 0"/>\'))',
  ].join('\n');
  const r = Bun.spawnSync([PY, '-c', code]);
  expect(r.stdout.toString().trim()).toBe('<path style="fill:#000;stroke-width:2;stroke-opacity:1" d="M0 0"/>');
});
