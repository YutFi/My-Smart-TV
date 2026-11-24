import type {
  Channel, DisplayInfo, HistoryItem, LibraryFolder, ListItem, MediaItem, Playlist, Profile, Programme, Settings,
} from '../../shared/types';

declare global {
  interface Window { tv: { invoke(ch: string, ...a: any[]): Promise<any>; on(ch: string, cb: (p: any) => void): () => void; platform: string } }
}

const inv = (ch: string, ...a: any[]): Promise<any> => {
  if (!window.tv) return Promise.reject(new Error('Not running inside MY SMART TV'));
  return window.tv.invoke(ch, ...a);
};

export interface Title {
  id: number; kind: 'movie' | 'tv'; title: string; year: number; overview: string; poster: string; backdrop: string; rating: number; genres: number[];
}
export interface TitleDetail extends Title {
  genreNames: string[]; runtime: number; tagline: string; cast: { name: string; character: string; photo: string }[];
  trailerKey: string; seasons: { number: number; name: string; episodes: number; poster: string }[];
  providers: { link: string; flatrate: string[]; rent: string[]; buy: string[] } | null; recommendations: Title[]; certification: string;
}
export interface Episode { number: number; name: string; overview: string; runtime: number; airDate: string; still: string }
export interface Game {
  id: string; league: string; name: string; date: number; state: 'pre' | 'in' | 'post'; status: string; venue: string;
  home: { name: string; abbr: string; logo: string; score: string; id: string }; away: { name: string; abbr: string; logo: string; score: string; id: string };
}
export interface SportDef { id: string; name: string; icon: string; news: string; leagues: { id: string; name: string; path: string }[] }
export interface NewsItem { title: string; link: string; desc: string; date: number; image: string }
export interface YtVideo { id: string; title: string; channel: string; thumb: string }
export interface Station { id: string; name: string; url: string; logo: string; tags: string; country: string; codec: string }
export interface BatteryInfo { present: boolean; percent: number; charging: boolean; pluggedIn: boolean; minutes: number }
export interface DriveInfo { letter: string; label: string; type: string; size: number; free: number }

export const api = {
  settings: { get: (): Promise<Settings> => inv('settings:get'), set: (p: Partial<Settings>): Promise<Settings> => inv('settings:set', p) },
  profiles: {
    list: (): Promise<Profile[]> => inv('profiles:list'),
    save: (p: Partial<Profile> & { pin?: string | null }): Promise<number> => inv('profiles:save', p),
    remove: (id: number) => inv('profiles:delete', id),
    verifyPin: (id: number, pin: string): Promise<boolean> => inv('profiles:verifyPin', id, pin),
  },
  parental: {
    hasPin: (): Promise<boolean> => inv('parental:hasPin'),
    setPin: (oldPin: string, newPin: string | null) => inv('parental:setPin', oldPin, newPin),
    verify: (pin: string): Promise<boolean> => inv('parental:verify', pin),
  },
  playlists: {
    list: (): Promise<Playlist[]> => inv('playlists:list'),
    add: (i: { name: string; source: string; kind: 'url' | 'file'; epgUrl?: string }): Promise<number> => inv('playlists:add', i),
    remove: (id: number) => inv('playlists:remove', id),
    update: (id: number, p: { name?: string; epgUrl?: string; autoUpdate?: boolean }) => inv('playlists:update', id, p),
    refresh: (id: number): Promise<{ ok: boolean; count: number; error?: string }> => inv('playlists:refresh', id),
    refreshAll: () => inv('playlists:refreshAll'),
  },
  channels: {
    list: (q: { q?: string; category?: string; playlistId?: number; ids?: number[]; limit?: number } = {}): Promise<Channel[]> => inv('channels:list', q),
    categories: (): Promise<{ name: string; count: number }[]> => inv('channels:categories'),
    broken: (id: number, b: boolean) => inv('channels:broken', id, b),
    purgeBroken: (): Promise<number> => inv('channels:purgeBroken'),
  },
  epg: {
    now: (ids: string[]): Promise<Record<string, { now?: Programme; next?: Programme }>> => inv('epg:now', ids),
    range: (ids: string[], from: number, to: number): Promise<Record<string, Programme[]>> => inv('epg:range', ids, from, to),
    search: (q: string): Promise<(Programme & { channelId: number; channelName: string })[]> => inv('epg:search', q),
    refresh: (): Promise<{ programmes: number; sources: number }> => inv('epg:refresh'),
    catchup: (id: number, s: number, e: number): Promise<string | null> => inv('catchup:url', id, s, e),
  },
  lists: {
    get: (pid: number, list: string, kind?: string): Promise<ListItem[]> => inv('lists:get', pid, list, kind),
    toggle: (pid: number, list: string, it: ListItem): Promise<boolean> => inv('lists:toggle', pid, list, it),
  },
  history: {
    record: (pid: number, it: ListItem & { position?: number; duration?: number }) => inv('history:record', pid, it),
    list: (pid: number, o: { kinds?: string[]; limit?: number; unfinished?: boolean } = {}): Promise<HistoryItem[]> => inv('history:list', pid, o),
    get: (pid: number, kind: string, ref: string): Promise<{ position: number; duration: number } | null> => inv('history:get', pid, kind, ref),
    clear: (pid: number) => inv('history:clear', pid),
    remove: (pid: number, kind: string, ref: string) => inv('history:remove', pid, kind, ref),
  },
  library: {
    folders: (): Promise<LibraryFolder[]> => inv('library:folders'),
    add: (p: string, kind: LibraryFolder['kind']): Promise<number> => inv('library:add', p, kind),
    remove: (id: number) => inv('library:remove', id),
    rescan: (id: number) => inv('library:rescan', id),
    media: (q: { kind?: string; q?: string; show?: string; limit?: number } = {}): Promise<MediaItem[]> => inv('library:media', q),
    get: (id: number): Promise<MediaItem | null> => inv('library:get', id),
    next: (id: number): Promise<MediaItem | null> => inv('library:next', id),
    shows: (): Promise<{ name: string; poster: string; backdrop: string; overview: string; tmdbId: number; episodes: number; seasons: number }[]> => inv('library:shows'),
    subtitle: (p: string): Promise<string> => inv('library:subtitle', p),
  },
  wallpaper: { pick: (kind: 'image' | 'video'): Promise<string | null> => inv('wallpaper:pick', kind) },
  dialog: { folder: (): Promise<string | null> => inv('dialog:folder'), file: (k: 'playlist' | 'media' | 'subtitle'): Promise<string | null> => inv('dialog:file', k) },
  tmdb: {
    status: (): Promise<{ hasKey: boolean }> => inv('tmdb:status'),
    list: (kind: 'movie' | 'tv', which: string, o: { maxRating?: string; genre?: number } = {}): Promise<Title[]> => inv('tmdb:list', kind, which, o),
    search: (q: string, maxRating?: string): Promise<Title[]> => inv('tmdb:search', q, maxRating),
    detail: (kind: 'movie' | 'tv', id: number): Promise<TitleDetail> => inv('tmdb:detail', kind, id),
    season: (id: number, n: number): Promise<Episode[]> => inv('tmdb:season', id, n),
  },
  sports: {
    defs: (): Promise<{ sports: SportDef[]; broadcasters: Record<string, { name: string; url: string }[]> }> => inv('sports:defs'),
    scoreboard: (path: string, name: string): Promise<Game[]> => inv('sports:scoreboard', path, name),
    standings: (path: string): Promise<{ team: string; logo: string; stats: Record<string, string> }[]> => inv('sports:standings', path),
    news: (topic: string): Promise<NewsItem[]> => inv('sports:news', topic),
  },
  youtube: { search: (q: string): Promise<YtVideo[]> => inv('youtube:search', q), trending: (): Promise<YtVideo[]> => inv('youtube:trending') },
  radio: { search: (o: { country?: string; q?: string; tag?: string }): Promise<Station[]> => inv('radio:search', o) },
  launch: {
    url: (url: string, o: { tv?: boolean; label?: string } = {}): Promise<{ ok: boolean; error?: string }> => inv('launch:url', url, o),
    app: (pid: number, id: string): Promise<{ ok: boolean; error?: string }> => inv('launch:app', pid, id),
    vlc: (t: string): Promise<{ ok: boolean; error?: string }> => inv('launch:vlc', t),
    browserSetup: (url: string): Promise<{ ok: boolean; error?: string }> => inv('launch:browserSetup', url),
    exe: (p: string, label: string): Promise<{ ok: boolean; error?: string }> => inv('launch:exe', p, label),
    nativeApps: (): Promise<Record<string, { path: string; icon: string }>> => inv('apps:native'),
    icon: (p: string): Promise<string> => inv('apps:icon', p),
    pickProgram: (): Promise<string | null> => inv('dialog:program'),
    shellApp: (id: string): Promise<{ ok: boolean; error?: string }> => inv('launch:shellapp', id),
    store: (q?: string) => inv('launch:store', q),
    home: () => inv('launch:home'),
    browsers: (): Promise<{ edge: string; chrome: string; vlc: string }> => inv('launch:browsers'),
    recents: (pid: number): Promise<string[]> => inv('recents:apps', pid),
    addRecent: (pid: number, id: string) => inv('recents:add', pid, id),
    external: (url: string) => inv('open:external', url),
  },
  spicetify: {
    status: (): Promise<{ spotifyInstalled: boolean; storeVersion: boolean; installed: boolean; theme: string }> => inv('spicetify:status'),
    install: (scheme: string): Promise<{ ok: boolean; error?: string }> => inv('spicetify:install', scheme),
    restore: (): Promise<{ ok: boolean; error?: string }> => inv('spicetify:restore'),
    openSpotify: (): Promise<boolean> => inv('spicetify:open'),
  },
  apps: {
    installed: (): Promise<{ name: string; appId: string }[]> => inv('apps:installed'),
    discover: (): Promise<{ name: string; appId: string; builtin?: string }[]> => inv('apps:discover'),
  },
  display: { list: (): Promise<DisplayInfo[]> => inv('display:list') },
  system: {
    info: (): Promise<any> => inv('system:info'),
    drives: (): Promise<DriveInfo[]> => inv('system:drives'),
    internet: (): Promise<boolean> => inv('system:internet'),
    keepAwake: (on: boolean) => inv('system:keepAwake', on),
    streamHeaders: (ua: string, referrer: string) => inv('player:headers', ua, referrer),
    battery: (): Promise<BatteryInfo> => inv('system:battery'),
    sleepPc: () => inv('system:sleepPc'),
    quit: () => inv('system:quit'),
    desktopMode: (on: boolean) => inv('system:desktopMode', on),
    backup: (): Promise<{ ok: boolean; path?: string; error?: string }> => inv('system:backup'),
    restore: (): Promise<{ ok: boolean; error?: string }> => inv('system:restore'),
    logs: (): Promise<string> => inv('system:logs'),
    openLogs: () => inv('system:openLogs'),
    checkUpdate: (feed: string): Promise<{ state: string; message: string }> => inv('system:checkUpdate', feed),
  },
  on: (ch: string, cb: (p: any) => void) => (window.tv ? window.tv.on(ch, cb) : () => undefined),
};

export const mediaUrl = (p: string) => `tvmedia://local/${encodeURIComponent(p)}`;
