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
    const byBuiltin = new Map<string, typeof found>();
    for (const a of found) {
      if (dismissed.has(a.appId)) continue;
      if (a.builtin) {
        (byBuiltin.get(a.builtin) || byBuiltin.set(a.builtin, []).get(a.builtin)!).push(a);
      } else if (!have.has(`uwp:${a.appId}`)) {
        await api.lists.toggle(pid(), 'sites', { kind: 'uwp', ref: a.appId, title: a.name, image: '' });
        added.push(a.name);
      }
    }
    // one Windows app per built-in tile: keep the current link while it still exists (so two installs never flip-flop),
    // otherwise prefer a regular desktop install over a Store one
    for (const [builtin, list] of byBuiltin) {
      const cur = nativeApps[builtin];
      if (cur && list.some((x) => x.appId === cur)) continue;
      const pick = list.find((x) => /^[A-Za-z]:\\/.test(x.appId)) || list[0];
      nativeApps[builtin] = pick.appId; nativeChanged = true; added.push(pick.name);
    }
    // a linked Windows app that was uninstalled: fall back to the website instead of a tile that opens nothing
    const liveIds = new Set(found.map((a) => a.appId));
    for (const [builtin, id] of Object.entries(nativeApps)) { if (!liveIds.has(id)) { delete nativeApps[builtin]; nativeChanged = true; } }
    if (nativeChanged) await updateSettings({ nativeApps });
    if (added.length) toast(`Added to MY SMART TV: ${added.slice(0, 3).join(', ')}${added.length > 3 ? ` +${added.length - 3} more` : ''}`, 'ok', 6500);
  } catch { /* discovery is best-effort */ } finally { running = false; }
}

export async function dismissApp(appId: string) {
  const s = appStore.get().settings;
  if (!s.dismissedApps.includes(appId)) await updateSettings({ dismissedApps: [...s.dismissedApps, appId] });
}
