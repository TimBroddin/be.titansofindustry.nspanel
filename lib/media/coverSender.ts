// Sends cover rectangles to the firmware in paced batches. Sending everything at once overflows the ESP
// (seen in the spike); a newer cover or a clear cancels a transfer that is still running.
export type PanelCall = (action: string, args: Record<string, unknown>) => Promise<void>;
export type Sleep = (ms: number) => Promise<void>;

export class CoverSender {
  private generation = 0;

  constructor(
    private readonly call: PanelCall,
    private readonly sleep: Sleep,
    private readonly batchSize = 40,
    private readonly gapMs = 120, // ~40 x 26 bytes at 115200 baud is ~90 ms of display traffic
  ) {}

  // Resolves true when the whole cover was sent, false when a newer cover/clear took over.
  async send(id: string, strips: string[]): Promise<boolean> {
    const gen = ++this.generation;
    await this.call('cover_begin', { id });
    for (let i = 0; i < strips.length; i += this.batchSize) {
      if (gen !== this.generation) return false;
      await this.call('cover_strips', { id, strips: strips.slice(i, i + this.batchSize) });
      await this.sleep(this.gapMs);
    }
    return gen === this.generation;
  }

  async clear(): Promise<void> {
    this.generation++;
    await this.call('cover_clear', {});
  }
}
