import { api } from './api';
import { appStore, pid, toast, updateSettings } from './app';

let running = false;
let lastRun = 0;

// Finds streaming / entertainment apps the user has installed (usually from the Microsoft Store) and puts them into MY SMART TV:
//  - apps that match one of the built-in tiles (Netflix, Disney+, Spotify, YouTube…) make that tile open the Windows app
//  - everything else (Plex, Kodi, VLC, Stremio, Hulu…) gets its own tile on Apps and Home
// Apps the user removed are remembered in `dismissedApps` and never re-added.
export async function syncApps(force = false) {
  const st = appStore.get();
  if (!st.settings.autoAddApps || !st.profile || running) return;
  if (!force && Date.now() - lastRun < 8000) return;
  running = true; lastRun = Date.now();
  try {
    const found = await api.apps.discover();
    const sites = await api.lists.get(pid(), 'sites');
    const have = new Set(sites.map((i) => `${i.kind}:${i.ref}`));
    const dismissed = new Set(st.settings.dismissedApps);
    const nativeApps = { ...st.settings.nativeApps };
    let nativeChanged = false; const added: string[] = [];
    for (const a of found) {
      if (dismissed.has(a.appId)) continue;
      if (a.builtin) {
        if (nativeApps[a.builtin] !== a.appId) { nativeApps[a.builtin] = a.appId; nativeChanged = true; added.push(a.name); }
      } else if (!have.has(`uwp:${a.appId}`)) {
        await api.lists.toggle(pid(), 'sites', { kind: 'uwp', ref: a.appId, title: a.name, image: '' });
        added.push(a.name);
      }
    }
    if (nativeChanged) await updateSettings({ nativeApps });
    if (added.length) toast(`Added to MY SMART TV: ${added.slice(0, 3).join(', ')}${added.length > 3 ? ` +${added.length - 3} more` : ''}`, 'ok', 6500);
  } catch { /* discovery is best-effort */ } finally { running = false; }
}

export async function dismissApp(appId: string) {
  const s = appStore.get().settings;
  if (!s.dismissedApps.includes(appId)) await updateSettings({ dismissedApps: [...s.dismissedApps, appId] });
}
