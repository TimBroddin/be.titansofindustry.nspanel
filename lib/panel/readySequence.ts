export interface ReadySequence {
  repaint: () => void;
  steps: Array<() => Promise<void>>;
  onError: (err: unknown) => void;
}

// Run on every (re)connect: repaint from what we already know first (the panel may have rebooted
// and be blank), then run each step independently so one failure cannot block the others, then
// repaint again with whatever the steps produced.
export async function runReadySequence({ repaint, steps, onError }: ReadySequence): Promise<void> {
  repaint();
  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      onError(err);
    }
  }
  repaint();
}
