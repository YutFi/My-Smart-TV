import { BrowserWindow } from 'electron';

export function broadcast(channel: string, payload?: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

export async function fetchBuffer(url: string, timeoutMs = 30000, headers: Record<string, string> = {}): Promise<Buffer> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'MySmartTV/1.0', ...headers }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson<T = any>(url: string, timeoutMs = 15000, headers: Record<string, string> = {}): Promise<T> {
  const buf = await fetchBuffer(url, timeoutMs, { Accept: 'application/json', ...headers });
  return JSON.parse(buf.toString('utf8')) as T;
}

export const yieldLoop = () => new Promise<void>((r) => setImmediate(r));
