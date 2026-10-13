// Keeps the panel's cover in step with the shown player's album art: fetch, convert, send (paced), or clear.
import { coverStrips } from './cover';
import { COVER_AREA } from './coverArea';
import { CoverSender } from './coverSender';

export interface CoverDeps {
  art(deviceId: string): Promise<{ url: string; key: string } | null>;
  fetch(url: string): Promise<Uint8Array>;
  sender: CoverSender;
  // The placeholder icon hides while a cover is drawn. Resolves once the panel has repainted it, because a
  // repaint of the icon's crop area would wipe strips drawn before it.
  shown(on: boolean): void | Promise<void>;
  error(...args: unknown[]): void;
}

export class CoverLoader {
  private key: string | null = null;
  private seq = 0;

  constructor(private readonly deps: CoverDeps) {}

  // The panel lost its cover cache (reboot/reconnect): send again on the next refresh.
  reset(): void {
    this.key = null;
  }

  async refresh(deviceId: string | null): Promise<void> {
    const art = deviceId ? await this.deps.art(deviceId) : null;
    const key = art ? `${deviceId}|${art.key}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!art) {
      await this.clear();
      return;
    }
    try {
      const strips = coverStrips(await this.deps.fetch(art.url), COVER_AREA);
      if (this.key !== key) return; // superseded while fetching
      await this.deps.shown(true);
      await this.deps.sender.send(`c${++this.seq}`, strips);
    } catch (err) {
      this.deps.error('Cover failed:', err);
      if (this.key === key) await this.clear();
    }
  }

  private async clear(): Promise<void> {
    await this.deps.shown(false);
    await this.deps.sender.clear();
  }
}
