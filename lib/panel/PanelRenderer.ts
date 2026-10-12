export type SendProps = (keys: string[], values: string[]) => Promise<void>;
export type Schedule = (fn: () => void, ms: number) => void;

export const MAX_BATCH = 40;

// Keeps the desired panel state, sends only what changed, and coalesces bursts.
export class PanelRenderer {
  private readonly desired = new Map<string, string>();
  private readonly sent = new Map<string, string>();
  private scheduled = false;

  constructor(
    private readonly send: SendProps,
    private readonly schedule: Schedule = (fn, ms) => {
      setTimeout(fn, ms);
    },
    private readonly windowMs = 50,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  update(props: Record<string, string>): void {
    for (const [k, v] of Object.entries(props)) this.desired.set(k, v);
    if (this.scheduled || this.dirtyKeys().length === 0) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      this.flush().catch(this.onError);
    }, this.windowMs);
  }

  // Forget what the panel has; next update/flush repaints everything (panel rebooted or reconnected).
  reset(): void {
    this.sent.clear();
  }

  async flush(): Promise<void> {
    const dirty = this.dirtyKeys();
    for (let i = 0; i < dirty.length; i += MAX_BATCH) {
      const keys = dirty.slice(i, i + MAX_BATCH);
      const values = keys.map((k) => this.desired.get(k) as string);
      await this.send(keys, values);
      keys.forEach((k, j) => this.sent.set(k, values[j]));
    }
  }

  private dirtyKeys(): string[] {
    return [...this.desired].filter(([k, v]) => this.sent.get(k) !== v).map(([k]) => k);
  }
}
