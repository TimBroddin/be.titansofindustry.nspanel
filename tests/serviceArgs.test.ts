import { describe, expect, test } from 'bun:test';
import { toServiceArgs } from '../lib/panel/serviceArgs';

const def = {
  name: 'demo', key: 1,
  argsList: [
    { name: 'flag', type: 0 }, { name: 'n', type: 1 }, { name: 'f', type: 2 }, { name: 's', type: 3 }, { name: 'list', type: 7 },
  ],
};

describe('toServiceArgs', () => {
  test('orders and coerces per definition', () => {
    expect(toServiceArgs(def, { list: [1, 'b'], s: 5, f: '1.5', n: 2.9, flag: 1 })).toEqual([
      { type: 0, value: true }, { type: 1, value: 2 }, { type: 2, value: 1.5 }, { type: 3, value: '5' }, { type: 7, value: ['1', 'b'] },
    ]);
  });

  test('throws on missing argument', () => {
    expect(() => toServiceArgs(def, { flag: true })).toThrow("Missing argument 'n' for demo");
  });
});
