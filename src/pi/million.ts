/** Загрузка и распаковка первого миллиона цифр π (public/pi-1m.bin). */
let cache: string | null = null;
let loading: Promise<string> | null = null;

export async function loadMillion(): Promise<string> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    const res = await fetch('/pi-1m.bin');
    if (!res.ok) throw new Error('load fail');
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const codes = new Uint8Array(bytes.length * 2);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      codes[i * 2] = 48 + ((b >> 4) & 0x0f);
      codes[i * 2 + 1] = 48 + (b & 0x0f);
    }
    const s = new TextDecoder().decode(codes);
    cache = s;
    return s;
  })();
  try {
    const s = await loading;
    return s;
  } catch (e) {
    loading = null;
    throw e;
  }
}

export function millionCached(): string | null {
  return cache;
}

export function primeMillion(): void {
  if (!cache && !loading) {
    void loadMillion().catch(() => {});
  }
}
