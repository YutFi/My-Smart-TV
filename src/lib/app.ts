import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Channel, type ListItem, type MediaItem, type Profile, type Settings } from '../../shared/types';
import { api, mediaUrl } from './api';
import { createStore, useStore } from './store';
import { restoreFocusTo } from './nav';
import { play } from './sfx';

// ---------------- app state ----------------
export const appStore = createStore<{ settings: Settings; profile: Profile | null; profiles: Profile[]; online: boolean; loaded: boolean }>({
  settings: DEFAULT_SETTINGS, profile: null, profiles: [], online: true, loaded: false,
});
export const useApp = () => useStore(appStore);
export const useSettings = () => useStore(appStore).settings;
export const currentProfile = () => appStore.get().profile;
export const pid = () => appStore.get().profile?.id ?? 1;

export async function updateSettings(patch: Partial<Settings>) {
  appStore.set((s) => ({ settings: { ...s.settings, ...patch } })); // optimistic
  try { appStore.set({ settings: await api.settings.set(patch) }); } catch (e: any) { toast(e.message || 'Could not save settings', 'error'); appStore.set({ settings: await api.settings.get() }); }
}

export async function reloadProfiles() {
  const profiles = await api.profiles.list();
  const cur = appStore.get().profile;
  appStore.set({ profiles, profile: cur ? profiles.find((p) => p.id === cur.id) || profiles[0] : null });
}

// ---------------- toasts ----------------
export interface Toast { id: number; msg: string; kind: 'info' | 'error' | 'ok' }
export const toastStore = createStore<{ items: Toast[] }>({ items: [] });
let toastId = 1;
export function toast(msg: string, kind: Toast['kind'] = 'info', ms = 3800) {
  play(kind === 'error' ? 'error' : kind === 'ok' ? 'success' : 'notify');
  const t = { id: toastId++, msg, kind };
  toastStore.set((s) => ({ items: [...s.items, t] }));
  setTimeout(() => toastStore.set((s) => ({ items: s.items.filter((x) => x.id !== t.id) })), ms);
}

// ---------------- router ----------------
export interface Route { page: string; params?: any; fk?: string }
export const TABS = ['home', 'live', 'movies', 'series', 'sports', 'apps', 'youtube', 'music', 'media', 'favorites', 'search', 'settings'] as const;
export const routeStore = createStore<{ route: Route; stack: Route[] }>({ route: { page: 'home' }, stack: [] });
export const useRoute = () => useStore(routeStore);

const focusedKey = () => (document.activeElement as HTMLElement | null)?.dataset?.fk || '';

export const nav = {
  go(page: string, params?: any) {
    if (routeStore.get().route.page !== page) play('tab');
    routeStore.set({ route: { page, params }, stack: [] });
    if ((TABS as readonly string[]).includes(page)) updateSettings({ lastRoute: page }).catch(() => undefined);
  },
  push(page: string, params?: any) {
    const s = routeStore.get();
    routeStore.set({ stack: [...s.stack, { ...s.route, fk: focusedKey() }], route: { page, params } });
  },
  back(): boolean {
    const s = routeStore.get();
    if (s.stack.length) {
      const prev = s.stack[s.stack.length - 1];
      routeStore.set({ route: { page: prev.page, params: prev.params }, stack: s.stack.slice(0, -1) });
      if (prev.fk) restoreFocusTo(prev.fk);
      return true;
    }
    if (s.route.page !== 'home') { nav.go('home'); return true; }
    return false;
  },
};

// ---------------- list helpers (favorites / watchlist) ----------------
export const listStore = createStore<{ fav: Set<string>; watch: Set<string>; version: number }>({ fav: new Set(), watch: new Set(), version: 0 });
const key = (it: { kind: string; ref: string }) => `${it.kind}:${it.ref}`;

export async function loadLists() {
  const p = pid();
  const [f, w] = await Promise.all([api.lists.get(p, 'favorites'), api.lists.get(p, 'watchlist')]);
  listStore.set((s) => ({ fav: new Set(f.map(key)), watch: new Set(w.map(key)), version: s.version + 1 }));
}
export async function toggleList(list: 'favorites' | 'watchlist', it: ListItem) {
  const on = await api.lists.toggle(pid(), list, it);
  await loadLists();
  toast(on ? (list === 'favorites' ? `Added “${it.title}” to Favorites` : `Added “${it.title}” to Watchlist`) : `Removed “${it.title}”`, 'ok', 2200);
  return on;
}
export const useLists = () => useStore(listStore);

// ---------------- player requests ----------------
export interface PlayRequest {
  type: 'live' | 'vod' | 'audio';
  url: string; title: string; subtitle?: string; image?: string;
  kind: string; ref: string; // history identity
  channel?: Channel; queue?: Channel[];
  startAt?: number; subs?: string[]; filePath?: string; data?: any;
  next?: () => Promise<PlayRequest | null>;
  isRadio?: boolean;
}
export const playerStore = createStore<{ req: PlayRequest | null }>({ req: null });
export const playMedia = (req: PlayRequest) => playerStore.set({ req });
export const stopPlayer = () => playerStore.set({ req: null });

export function channelRequest(c: Channel, queue: Channel[]): PlayRequest {
  return { type: 'live', url: c.url, title: c.name, subtitle: `CH ${c.num} · ${c.category}`, image: c.logo, kind: 'channel', ref: String(c.id), channel: c, queue };
}

export async function localRequest(item: MediaItem, resume = true): Promise<PlayRequest> {
  const full = (await api.library.get(item.id)) || item;
  let startAt = 0;
  if (resume) { const h = await api.history.get(pid(), 'media', String(item.id)); if (h && h.duration && h.position < h.duration * 0.95 && h.position > 10) startAt = h.position; }
  const isAudio = item.kind === 'music';
  return {
    type: isAudio ? 'audio' : 'vod', url: mediaUrl(item.path), filePath: item.path, title: item.kind === 'episode' ? item.title : item.title + (item.year ? ` (${item.year})` : ''),
    subtitle: item.kind === 'episode' ? item.show : undefined, image: item.poster, kind: 'media', ref: String(item.id), startAt, subs: full.subs,
    data: { id: item.id, kind: item.kind },
    next: item.kind === 'episode' ? async () => { const n = await api.library.next(item.id); return n ? localRequest(n, false) : null; } : undefined,
  };
}

// ---------------- helpers ----------------
export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []): { data: T | null; loading: boolean; error: string; reload: () => void } {
  const [st, setSt] = useState<{ data: T | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setSt((s) => ({ ...s, loading: true, error: '' }));
    fn().then((d) => live && setSt({ data: d, loading: false, error: '' })).catch((e) => live && setSt({ data: null, loading: false, error: e?.message || 'Failed' }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...st, reload: () => setN((x) => x + 1) };
}

export function ratingAllowed(profile: Profile | null) { return profile && profile.kids ? profile.maxRating : profile?.maxRating || 'all'; }
export const isKids = () => !!appStore.get().profile?.kids;
