// Types and constants shared by the Electron main process and the React renderer.

export interface Settings {
  // general
  language: string;
  theme: 'cinematic' | 'midnight' | 'oled';
  homeRows: string[]; // ordered ids of rows shown on Home
  startupFullscreen: boolean;
  autoStart: boolean;
  resumeLastRoute: boolean;
  resumeLastChannel: boolean;
  setupDone: boolean;
  lastProfileId: number | null;
  askProfileOnStart: boolean;
  // display
  displayId: number | null; // null = primary / auto
  uiScale: number; // 0.8 .. 1.4
  overscan: number; // percent margin 0..10
  // audio
  audioDeviceId: string; // '' = system default
  volume: number; // 0..1
  // live tv
  epgUrls: string[];
  playlistRefreshHours: number;
  // player
  videoEngine: 'html5' | 'vlc';
  hwAccel: boolean;
  subtitleSize: number; // 1 = normal
  subtitleColor: string;
  subtitleBg: boolean;
  subtitleLang: string;
  audioLang: string;
  autoplayNext: boolean;
  // network / apis
  tmdbKey: string; // stored encrypted at rest, returned masked to the renderer
  youtubeKey: string;
  browser: 'auto' | 'edge' | 'chrome' | 'default';
  // smart
  screensaverMinutes: number; // 0 = off
  screensaverStyle: 'auto' | 'aurora' | 'stars' | 'bokeh' | 'waves' | 'grid' | 'artwork';
  gamingMode: boolean;
  animatedBackground: boolean;
  sleepAction: 'stop' | 'sleep-pc';
  // parental
  parentalEnabled: boolean;
  // session
  lastRoute: string;
  lastChannelId: number | null;
  // misc
  region: string; // ISO country for TMDB / radio
  sportsFavorites: string[];
  logo: string;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'cinematic',
  homeRows: ['continue', 'live', 'trending', 'series', 'sports', 'apps', 'youtube', 'music', 'media', 'favorites', 'watchlist', 'recent', 'recommended'],
  startupFullscreen: true,
  autoStart: false,
  resumeLastRoute: true,
  resumeLastChannel: false,
  setupDone: false,
  lastProfileId: null,
  askProfileOnStart: true,
  displayId: null,
  uiScale: 1,
  overscan: 2,
  audioDeviceId: '',
  volume: 1,
  epgUrls: [],
  playlistRefreshHours: 12,
  videoEngine: 'html5',
  hwAccel: true,
  subtitleSize: 1,
  subtitleColor: '#ffffff',
  subtitleBg: true,
  subtitleLang: 'en',
  audioLang: 'en',
  autoplayNext: true,
  tmdbKey: '',
  youtubeKey: '',
  browser: 'auto',
  screensaverMinutes: 5,
  screensaverStyle: 'auto',
  gamingMode: true,
  animatedBackground: true,
  sleepAction: 'stop',
  parentalEnabled: false,
  lastRoute: 'home',
  lastChannelId: null,
  region: 'MY',
  sportsFavorites: [],
  logo: '',
};

export interface Profile {
  id: number;
  name: string;
  avatar: string; // emoji
  color: string;
  hasPin: boolean;
  kids: boolean;
  maxRating: string; // 'all' | 'G' | 'PG' | 'PG-13' | 'R'
  blockedCategories: string[];
}

export interface Playlist {
  id: number;
  name: string;
  source: string; // URL or local file path
  kind: 'url' | 'file';
  epgUrl: string;
  autoUpdate: boolean;
  updatedAt: number;
  channelCount: number;
  error: string;
}

export interface Channel {
  id: number;
  playlistId: number;
  num: number;
  name: string;
  logo: string;
  group: string;
  category: string;
  url: string;
  tvgId: string;
  country: string;
  catchup: string; // '' | 'default' | 'append' | 'shift' | 'flussonic' ...
  catchupSource: string;
  catchupDays: number;
  broken: boolean;
  ua: string;
  referrer: string;
}

export interface Programme {
  channel: string; // tvg id
  start: number; // ms
  stop: number;
  title: string;
  desc: string;
}

export interface ListItem {
  kind: string; // channel | movie | tv | media | team | app | youtube | station
  ref: string;
  title: string;
  image: string;
  sub?: string;
  data?: any;
}

export interface HistoryItem extends ListItem {
  position: number; // seconds
  duration: number;
  updatedAt: number;
}

export interface LibraryFolder {
  id: number;
  path: string;
  kind: 'movies' | 'shows' | 'music' | 'videos';
  itemCount: number;
}

export interface MediaItem {
  id: number;
  folderId: number;
  path: string;
  title: string;
  kind: 'movie' | 'episode' | 'music' | 'video';
  year: number;
  show: string;
  season: number;
  episode: number;
  poster: string;
  backdrop: string;
  overview: string;
  tmdbId: number;
  size: number;
  subs: string[];
}

export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  scaleFactor: number;
  refreshRate: number;
  primary: boolean;
  internal: boolean;
  isTarget: boolean;
  colorDepth: number;
  hdr: boolean;
}

export const CATEGORIES = [
  'Malaysia TV', 'Singapore TV', 'International', 'News', 'Sports', 'Movies', 'Entertainment',
  'Documentary', 'Kids', 'Music', 'Lifestyle', 'Religious', 'Educational',
] as const;

export interface StreamingApp {
  id: string;
  name: string;
  url: string;
  color: string; // gradient from
  color2: string;
  text: string; // wordmark
  protocol?: string; // optional Windows protocol handler
  exe?: string[]; // installed desktop client locations (launched natively when found)
  gaming?: boolean; // run gaming mode while it is open
  tv?: boolean; // supports TV UI
  note?: string;
}

export const STREAMING_APPS: StreamingApp[] = [
  { id: 'nebula', name: 'Nebula Cloud Gaming', url: 'https://nebula.my/', color: '#7c3aed', color2: '#0e7490', text: 'NEBULA', gaming: true, exe: ['C:\\Program Files\\Nebula Technologies\\Nebula Client\\bin\\Nebula.exe', 'C:\\Program Files (x86)\\Nebula Technologies\\Nebula Client\\bin\\Nebula.exe'], note: 'Cloud gaming client; opens the website if the desktop client is not installed' },
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/browse', color: '#e50914', color2: '#7a0309', text: 'NETFLIX' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', color: '#ff0033', color2: '#8a0019', text: 'YouTube', tv: true },
  { id: 'disney', name: 'Disney+', url: 'https://www.disneyplus.com/', color: '#1a3cff', color2: '#0b1d80', text: 'Disney+' },
  { id: 'prime', name: 'Prime Video', url: 'https://www.primevideo.com/', color: '#00a8e1', color2: '#00506b', text: 'prime video' },
  { id: 'appletv', name: 'Apple TV', url: 'https://tv.apple.com/', color: '#2b2b30', color2: '#050505', text: ' tv' },
  { id: 'max', name: 'Max', url: 'https://www.max.com/', color: '#5a2bd8', color2: '#25116b', text: 'max' },
  { id: 'iqiyi', name: 'iQIYI', url: 'https://www.iq.com/', color: '#00cc36', color2: '#006b1c', text: 'iQIYI' },
  { id: 'viu', name: 'Viu', url: 'https://www.viu.com/', color: '#ffb400', color2: '#8a5d00', text: 'viu' },
  { id: 'wetv', name: 'WeTV', url: 'https://wetv.vip/', color: '#ff6a00', color2: '#8a3900', text: 'WeTV' },
  { id: 'crunchyroll', name: 'Crunchyroll', url: 'https://www.crunchyroll.com/', color: '#f47521', color2: '#7a3a10', text: 'crunchyroll' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/', color: '#1db954', color2: '#0b5a28', text: 'Spotify', protocol: 'spotify:' },
  { id: 'hotstar', name: 'Disney+ Hotstar', url: 'https://www.hotstar.com/', color: '#0f2a8f', color2: '#060f45', text: 'hotstar' },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv/', color: '#9146ff', color2: '#47238a', text: 'twitch' },
  { id: 'mytv', name: 'Astro / Sooka', url: 'https://www.sooka.my/', color: '#0066ff', color2: '#00307a', text: 'sooka' },
];

export const AVATARS = ['😀', '😎', '🦊', '🐼', '🦁', '🐙', '🚀', '🎮', '🎬', '🌈', '👑', '🐯'];
export const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#22d3ee', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

export const RATING_ORDER = ['G', 'PG', 'PG-13', 'R', 'all'];
