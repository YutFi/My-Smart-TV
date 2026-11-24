import { contextBridge, ipcRenderer } from 'electron';

// A deliberately small bridge: request/response calls plus a few push events from the main process.
const EVENTS = new Set(['display:changed', 'iptv:progress', 'library:progress', 'tv:foreground', 'tv:desktop-mode', 'tv:media-key', 'tv:battery', 'tv:gaming', 'spicetify:progress', 'settings:changed']);

contextBridge.exposeInMainWorld('tv', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (payload: any) => void) => {
    if (!EVENTS.has(channel)) return () => undefined;
    const h = (_e: unknown, p: unknown) => cb(p);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
  platform: process.platform,
});
