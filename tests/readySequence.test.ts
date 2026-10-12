import { describe, expect, test } from 'bun:test';
import { runReadySequence } from '../lib/panel/readySequence';

describe('runReadySequence', () => {
  test('repaints before slow or failing steps, and a failing step does not stop the rest', async () => {
    const log: string[] = [];
    const errors: unknown[] = [];
    await runReadySequence({
      repaint: () => log.push('repaint'),
      steps: [
        async () => { log.push('settings'); throw new Error('no set_button_mode'); },
        async () => { log.push('watch'); },
      ],
      onError: (err) => errors.push(err),
    });
    expect(log).toEqual(['repaint', 'settings', 'watch', 'repaint']);
    expect(errors).toHaveLength(1);
  });
});
