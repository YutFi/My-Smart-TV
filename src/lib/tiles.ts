import { api } from './api';
import { appStore, pid, toast, updateSettings } from './app';
import { dismissApp } from './appsync';
import { createStore } from './store';
import type { ListItem } from '../../shared/types';

// Tiles on Apps and Home can be removed by the user at any time (Menu key, right-click or long-press the tile) and brought back
// from Apps -> Manage tiles. Removing a tile never uninstalls or deletes the app itself.
export interface TileInfo { title: string; kind: 'builtin' | 'site' | 'exe' | 'uwp'; id: string; item?: ListItem; open: () => void }

export const tileMenuStore = createStore<{ tile: TileInfo | null }>({ tile: null });
export const tilesStore = createStore<{ version: number }>({ version: 0 });
export const bumpTiles = () => tilesStore.set((s) => ({ version: s.version + 1 }));
export const openTileMenu = (tile: TileInfo) => tileMenuStore.set({ tile });
export const closeTileMenu = () => tileMenuStore.set({ tile: null });

export async function removeTile(t: TileInfo) {
  if (t.kind === 'builtin') {
    const s = appStore.get().settings;
    await updateSettings({ hiddenApps: [...new Set([...s.hiddenApps, t.id])] });
  } else if (t.item) {
    await api.lists.toggle(pid(), 'sites', t.item);
    if (t.kind === 'uwp') await dismissApp(t.id);
  }
  bumpTiles();
  toast(`Removed “${t.title}” from MY SMART TV (the app itself is untouched). Bring it back in Apps → Manage tiles.`, 'info', 7000);
}

export async function restoreBuiltin(id: string) {
  const s = appStore.get().settings;
  await updateSettings({ hiddenApps: s.hiddenApps.filter((x) => x !== id) });
  bumpTiles();
}

export async function restoreDismissed(appId: string) {
  const s = appStore.get().settings;
  await updateSettings({ dismissedApps: s.dismissedApps.filter((x) => x !== appId) });
  bumpTiles();
}
