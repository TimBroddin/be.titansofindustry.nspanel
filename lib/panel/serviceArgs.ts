export interface ServiceDef { name: string; key: number; argsList: Array<{ name: string; type: number }> }

// ESPHome ServiceArgType: 0 bool, 1 int, 2 float, 3 string, 4 bool[], 5 int[], 6 float[], 7 string[]
export function toServiceArgs(def: ServiceDef, args: Record<string, unknown>): Array<{ type: number; value: unknown }> {
  return def.argsList.map(({ name, type }) => {
    if (!(name in args)) throw new Error(`Missing argument '${name}' for ${def.name}`);
    const v = args[name];
    const list = (): unknown[] => (Array.isArray(v) ? v : []);
    switch (type) {
      case 0: return { type, value: Boolean(v) };
      case 1: return { type, value: Math.trunc(Number(v)) };
      case 2: return { type, value: Number(v) };
      case 3: return { type, value: String(v) };
      case 4: return { type, value: list().map(Boolean) };
      case 5: return { type, value: list().map((x) => Math.trunc(Number(x))) };
      case 6: return { type, value: list().map(Number) };
      case 7: return { type, value: list().map(String) };
      default: throw new Error(`Unsupported argument type ${type} for ${def.name}.${name}`);
    }
  });
}
