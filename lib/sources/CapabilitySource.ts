import { CapabilityRef, capKey } from '../config';

export interface CapabilityInstance { destroy(): void }

export interface WatchableDevice {
  capabilitiesObj?: Record<string, { value?: unknown }> | null;
  makeCapabilityInstance(capabilityId: string, listener: (value: unknown) => void): CapabilityInstance;
}

export interface DeviceProvider { getDevice(deviceId: string): Promise<WatchableDevice> }

// Live view of the capability values the dashboard shows. Failed refs are stored as null and
// retried on the next watch() call.
export class CapabilitySource {
  readonly values = new Map<string, unknown>();
  private readonly instances = new Map<string, CapabilityInstance>();

  constructor(
    private readonly devices: DeviceProvider,
    private readonly onChange: () => void,
    private readonly error: (...args: unknown[]) => void = () => {},
  ) {}

  async watch(refs: CapabilityRef[]): Promise<void> {
    const wanted = new Map(refs.map((r) => [capKey(r.deviceId, r.capability), r]));

    for (const [key, instance] of this.instances) {
      if (wanted.has(key)) continue;
      instance.destroy();
      this.instances.delete(key);
    }
    for (const key of [...this.values.keys()]) if (!wanted.has(key)) this.values.delete(key);

    let changed = false;
    for (const [key, ref] of wanted) {
      if (this.instances.has(key)) continue;
      try {
        const device = await this.devices.getDevice(ref.deviceId);
        this.values.set(key, device.capabilitiesObj?.[ref.capability]?.value ?? null);
        this.instances.set(key, device.makeCapabilityInstance(ref.capability, (value) => {
          this.values.set(key, value);
          this.onChange();
        }));
      } catch (err) {
        this.error(`Cannot watch ${key}:`, err);
        this.values.set(key, null);
      }
      changed = true;
    }
    if (changed) this.onChange();
  }

  destroy(): void {
    for (const instance of this.instances.values()) instance.destroy();
    this.instances.clear();
    this.values.clear();
  }
}
