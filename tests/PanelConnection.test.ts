import { describe, expect, test } from 'bun:test';
import { PanelConnection } from '../lib/panel/PanelConnection';

function make(encryptionKey: string) {
  const fatals: string[] = [];
  const conn = new PanelConnection({ host: '127.0.0.1', port: 1, encryptionKey, log: () => {}, error: () => {} });
  conn.on('fatal', (msg: string) => fatals.push(msg));
  return { conn, fatals };
}

describe('PanelConnection.start', () => {
  test('reports a malformed encryption key instead of throwing', () => {
    const { conn, fatals } = make('not-a-valid-key');
    expect(() => conn.start()).not.toThrow();
    expect(fatals).toHaveLength(1);
    expect(fatals[0]).toContain('encryption key');
    expect(conn.connected).toBe(false);
  });

  test('reports a missing encryption key (firmware requires encryption)', () => {
    const { conn, fatals } = make('');
    conn.start();
    expect(fatals).toEqual(['Encryption key required']);
    expect(conn.connected).toBe(false);
  });
});
