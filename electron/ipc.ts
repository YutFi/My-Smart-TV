import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, loadSettings, saveSettings } from './db';
import { DEFAULT_SETTINGS, STREAMING_APPS, type ListItem, type Profile, type Settings } from '../shared/types';
import { hashPin, verifyPin, seal, unseal } from './services/security';
import * as iptv from './services/iptv';
import * as tmdb from './services/tmdb';
import * as sports from './services/sports';
import * as lib from './services/library';
import * as launcher from './services/launcher';
import * as sys from './services/system';
import { log, logFile } from './services/log';
import { fetchJson } from './services/bus';
import { streamHeaders } from './services/stream';
import { refreshBattery } from './services/battery';

export const allowedFiles = new Set<string>();

type Handler = (e: IpcMainInvokeEvent, ...args: any[]) => any;

function handle(channel: string, fn: Handler) {
  ipcMain.handle(channel, async (e, ...args) => {
    const url = e.senderFrame?.url || '';
    if (!(url.startsWith('file://') || url.startsWith('http://localhost:5173'))) throw new Error('Blocked IPC from untrusted frame');
    try { return await fn(e, ...args); } catch (err: any) {
      log.warn(`IPC ${channel} failed`, err?.message || err);
      throw new Error(err?.message || String(err));
    }
  });
}

const MASK = '••••••••';

function publicSettings(): Settings {
  const s = loadSettings();
  return { ...s, tmdbKey: unseal(s.tmdbKey) ? MASK : '', youtubeKey: unseal(s.youtubeKey) ? MASK : '', autoStart: sys.getAutoStart() };
}

const rowToProfile = (r: any): Profile => ({
  id: r.id, name: r.name, avatar: r.avatar, color: r.color, hasPin: !!r.pin_hash, kids: !!r.kids, maxRating: r.max_rating,
  blockedCategories: JSON.parse(r.blocked || '[]'),
});

const getMaster = () => get<any>("SELECT value FROM meta WHERE key='master_pin'")?.value || '';

function mainWin(e: IpcMainInvokeEvent) { return BrowserWindow.fromWebContents(e.sender); }

export function registerIpc(hooks: { applyDisplay: () => void; setDesktopMode: (on: boolean) => void }) {
  // ---------- settings ----------
  handle('settings:get', () => publicSettings());
  handle('settings:set', (_e, patch: Partial<Settings>) => {
    const p: any = { ...patch };
    for (const k of ['tmdbKey', 'youtubeKey']) {
      if (k in p) { if (p[k] === MASK) delete p[k]; else p[k] = seal(String(p[k] || '').trim()); }
    }
    if ('autoStart' in p) { const r = sys.setAutoStart(!!p.autoStart); if (!r.ok) throw new Error(r.error); delete p.autoStart; }
    saveSettings(p);
    if ('displayId' in p) hooks.applyDisplay();
    return publicSettings();
  });
  handle('settings:defaults', () => DEFAULT_SETTINGS);

  // ---------- profiles & parental ----------
  handle('profiles:list', () => all('SELECT * FROM profiles ORDER BY id').map(rowToProfile));
  handle('profiles:save', (_e, p: Partial<Profile> & { pin?: string | null }) => {
    const blocked = JSON.stringify(p.blockedCategories || []);
    if (p.id) {
      run('UPDATE profiles SET name=?, avatar=?, color=?, kids=?, max_rating=?, blocked=? WHERE id=?', p.name, p.avatar, p.color, p.kids ? 1 : 0, p.maxRating || 'all', blocked, p.id);
      if (p.pin === null) run("UPDATE profiles SET pin_hash='' WHERE id=?", p.id);
      else if (p.pin) run('UPDATE profiles SET pin_hash=? WHERE id=?', hashPin(p.pin), p.id);
      return p.id;
    }
    const r = run('INSERT INTO profiles(name,avatar,color,pin_hash,kids,max_rating,blocked,created) VALUES (?,?,?,?,?,?,?,?)', p.name || 'Profile', p.avatar || '😀', p.color || '#8b5cf6', p.pin ? hashPin(p.pin) : '', p.kids ? 1 : 0, p.maxRating || 'all', blocked, Date.now());
    return Number(r.lastInsertRowid);
  });
  handle('profiles:delete', (_e, id: number) => {
    if ((get<any>('SELECT COUNT(*) c FROM profiles') as any).c <= 1) throw new Error('At least one profile is required.');
    run('DELETE FROM profiles WHERE id=?', id);
    run('DELETE FROM lists WHERE profile_id=?', id); run('DELETE FROM history WHERE profile_id=?', id); run('DELETE FROM recent_apps WHERE profile_id=?', id);
  });
  handle('profiles:verifyPin', (_e, id: number, pin: string) => verifyPin(pin, get<any>('SELECT pin_hash FROM profiles WHERE id=?', id)?.pin_hash || ''));
  handle('parental:hasPin', () => !!getMaster());
  handle('parental:setPin', (_e, oldPin: string, newPin: string | null) => {
    const cur = getMaster();
    if (cur && !verifyPin(oldPin, cur)) throw new Error('Incorrect current PIN.');
    if (newPin === null) run("DELETE FROM meta WHERE key='master_pin'");
    else { if (!/^\d{4}$/.test(newPin)) throw new Error('PIN must be exactly 4 digits.'); run("INSERT INTO meta(key,value) VALUES ('master_pin',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", hashPin(newPin)); }
    return true;
  });
  handle('parental:verify', (_e, pin: string) => verifyPin(pin, getMaster()));

  // ---------- IPTV ----------
  handle('playlists:list', () => iptv.listPlaylists());
  handle('playlists:add', (_e, input) => iptv.addPlaylist(input));
  handle('playlists:remove', (_e, id: number) => iptv.removePlaylist(id));
  handle('playlists:update', (_e, id: number, patch) => iptv.renamePlaylist(id, patch));
  handle('playlists:refresh', (_e, id: number) => iptv.refreshPlaylist(id));
  handle('playlists:refreshAll', () => iptv.refreshAll());
  handle('channels:list', (_e, q) => iptv.listChannels(q));
  handle('channels:categories', () => iptv.channelCategories());
  handle('channels:broken', (_e, id: number, broken: boolean) => iptv.markBroken(id, broken));
  handle('channels:purgeBroken', () => Number(run('DELETE FROM channels WHERE broken=1').changes));
  handle('epg:now', (_e, ids: string[]) => iptv.epgNow(ids));
  handle('epg:range', (_e, ids: string[], from: number, to: number) => iptv.epgRange(ids, from, to));
  handle('epg:search', (_e, q: string) => iptv.epgSearch(q));
  handle('epg:refresh', () => iptv.refreshEpg());
  handle('catchup:url', (_e, id: number, s: number, en: number) => iptv.catchupUrl(id, s, en));

  // ---------- lists / history ----------
  handle('lists:get', (_e, pid: number, list: string, kind?: string) =>
    all<any>(`SELECT * FROM lists WHERE profile_id=? AND list=? ${kind ? 'AND kind=?' : ''} ORDER BY added DESC`, ...(kind ? [pid, list, kind] : [pid, list])).map((r) => ({ kind: r.kind, ref: r.ref, title: r.title, image: r.image, sub: r.sub, data: JSON.parse(r.data) } as ListItem)));
  handle('lists:toggle', (_e, pid: number, list: string, it: ListItem) => {
    const ex = get('SELECT 1 FROM lists WHERE profile_id=? AND list=? AND kind=? AND ref=?', pid, list, it.kind, it.ref);
    if (ex) { run('DELETE FROM lists WHERE profile_id=? AND list=? AND kind=? AND ref=?', pid, list, it.kind, it.ref); return false; }
    run('INSERT INTO lists(profile_id,list,kind,ref,title,image,sub,data,added) VALUES (?,?,?,?,?,?,?,?,?)', pid, list, it.kind, it.ref, it.title, it.image || '', it.sub || '', JSON.stringify(it.data || {}), Date.now());
    return true;
  });
  handle('history:record', (_e, pid: number, it: ListItem & { position?: number; duration?: number }) => {
    run(`INSERT INTO history(profile_id,kind,ref,title,image,sub,position,duration,data,updated) VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(profile_id,kind,ref) DO UPDATE SET title=excluded.title, image=excluded.image, sub=excluded.sub, position=excluded.position, duration=excluded.duration, data=excluded.data, updated=excluded.updated`,
      pid, it.kind, it.ref, it.title, it.image || '', it.sub || '', it.position || 0, it.duration || 0, JSON.stringify(it.data || {}), Date.now());
  });
  handle('history:list', (_e, pid: number, opts: { kinds?: string[]; limit?: number; unfinished?: boolean } = {}) => {
    const w = ['profile_id=?']; const p: any[] = [pid];
    if (opts.kinds?.length) { w.push(`kind IN (${opts.kinds.map(() => '?').join(',')})`); p.push(...opts.kinds); }
    if (opts.unfinished) w.push('position > 10 AND (duration = 0 OR position < duration * 0.95)');
    return all<any>(`SELECT * FROM history WHERE ${w.join(' AND ')} ORDER BY updated DESC LIMIT ${opts.limit ?? 40}`, ...p).map((r) => ({
      kind: r.kind, ref: r.ref, title: r.title, image: r.image, sub: r.sub, position: r.position, duration: r.duration, updatedAt: r.updated, data: JSON.parse(r.data),
    }));
  });
  handle('history:get', (_e, pid: number, kind: string, ref: string) => {
    const r = get<any>('SELECT position,duration FROM history WHERE profile_id=? AND kind=? AND ref=?', pid, kind, ref);
    return r ? { position: r.position, duration: r.duration } : null;
  });
  handle('history:clear', (_e, pid: number) => run('DELETE FROM history WHERE profile_id=?', pid));
  handle('history:remove', (_e, pid: number, kind: string, ref: string) => run('DELETE FROM history WHERE profile_id=? AND kind=? AND ref=?', pid, kind, ref));

  // ---------- library ----------
  handle('library:folders', () => lib.listFolders());
  handle('library:add', (_e, p: string, kind) => lib.addFolder(p, kind));
  handle('library:remove', (_e, id: number) => lib.removeFolder(id));
  handle('library:rescan', (_e, id: number) => lib.scanFolder(id));
  handle('library:media', (_e, q) => lib.listMedia(q));
  handle('library:get', (_e, id: number) => lib.getMedia(id));
  handle('library:next', (_e, id: number) => lib.nextEpisode(id));
  handle('library:shows', () => lib.showsList());
  handle('library:subtitle', (_e, p: string) => lib.readSubtitle(p));
  handle('dialog:folder', async (e) => {
    const r = await dialog.showOpenDialog(mainWin(e)!, { properties: ['openDirectory'], title: 'Choose a media folder (USB drives and network shares included)' });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:program', async (e) => {
    const r = await dialog.showOpenDialog(mainWin(e)!, { properties: ['openFile'], title: 'Choose a Windows program or shortcut', defaultPath: 'C:\\Program Files', filters: [{ name: 'Programs & shortcuts', extensions: ['exe', 'lnk'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    let p = r.filePaths[0];
    if (/\.lnk$/i.test(p)) { try { p = shell.readShortcutLink(p).target || p; } catch { /* keep */ } }
    return /\.exe$/i.test(p) ? p : null;
  });
  handle('dialog:file', async (e, kind: 'playlist' | 'media' | 'subtitle') => {
    const filters = kind === 'playlist' ? [{ name: 'Playlists', extensions: ['m3u', 'm3u8', 'gz'] }] : kind === 'subtitle' ? [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }] : [{ name: 'Media', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'mp3', 'aac', 'flac', 'm4v', 'webm', 'm3u8'] }];
    const r = await dialog.showOpenDialog(mainWin(e)!, { properties: ['openFile'], filters });
    if (r.canceled) return null;
    allowedFiles.add(path.normalize(r.filePaths[0]).toLowerCase());
    return r.filePaths[0];
  });

  // ---------- metadata ----------
  handle('tmdb:status', () => ({ hasKey: tmdb.hasKey() }));
  handle('tmdb:list', (_e, kind, which, opts) => tmdb.list(kind, which, opts));
  handle('tmdb:search', (_e, q: string, maxRating?: string) => tmdb.search(q, maxRating));
  handle('tmdb:detail', (_e, kind, id: number) => tmdb.detail(kind, id));
  handle('tmdb:season', (_e, id: number, n: number) => tmdb.season(id, n));

  // ---------- sports ----------
  handle('sports:defs', () => ({ sports: sports.SPORTS, broadcasters: sports.BROADCASTERS }));
  handle('sports:scoreboard', (_e, p: string, name: string) => sports.scoreboard(p, name));
  handle('sports:standings', (_e, p: string) => sports.standings(p));
  handle('sports:news', (_e, topic: string) => sports.news(topic));

  // ---------- YouTube (optional API key) & radio ----------
  handle('youtube:search', async (_e, q: string) => {
    const key = unseal(loadSettings().youtubeKey as unknown as string);
    if (!key) throw new Error('NO_YT_KEY');
    const u = new URL('https://www.googleapis.com/youtube/v3/search');
    u.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '24', q, key, safeSearch: 'moderate' }).toString();
    const j = await fetchJson<any>(u.toString());
    return (j.items || []).map((i: any) => ({ id: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle, thumb: i.snippet.thumbnails?.high?.url || i.snippet.thumbnails?.medium?.url || '' }));
  });
  handle('youtube:trending', async () => {
    const key = unseal(loadSettings().youtubeKey as unknown as string);
    if (!key) throw new Error('NO_YT_KEY');
    const region = loadSettings().region || 'US';
    const u = new URL('https://www.googleapis.com/youtube/v3/videos');
    u.search = new URLSearchParams({ part: 'snippet', chart: 'mostPopular', regionCode: region, maxResults: '24', key }).toString();
    const j = await fetchJson<any>(u.toString());
    return (j.items || []).map((i: any) => ({ id: i.id, title: i.snippet.title, channel: i.snippet.channelTitle, thumb: i.snippet.thumbnails?.high?.url || i.snippet.thumbnails?.medium?.url || '' }));
  });
  handle('radio:search', async (_e, opts: { country?: string; q?: string; tag?: string }) => {
    const u = new URL('https://de1.api.radio-browser.info/json/stations/search');
    const p: Record<string, string> = { limit: '60', hidebroken: 'true', order: 'clickcount', reverse: 'true' };
    if (opts.country) p.countrycode = opts.country; if (opts.q) p.name = opts.q; if (opts.tag) p.tag = opts.tag;
    u.search = new URLSearchParams(p).toString();
    const j = await fetchJson<any[]>(u.toString(), 15000);
    return j.filter((s) => s.url_resolved).map((s) => ({ id: s.stationuuid, name: s.name, url: s.url_resolved, logo: s.favicon || '', tags: s.tags || '', country: s.countrycode, codec: s.codec }));
  });

  // ---------- launching ----------
  handle('launch:url', (_e, url: string, opts) => launcher.launchUrl(url, opts));
  handle('launch:app', async (_e, pid: number, appId: string) => {
    const a = STREAMING_APPS.find((x) => x.id === appId);
    if (!a) throw new Error('Unknown app');
    run('INSERT INTO recent_apps(profile_id,app_id,opened) VALUES (?,?,?) ON CONFLICT(profile_id,app_id) DO UPDATE SET opened=excluded.opened', pid, appId, Date.now());
    if (a.protocol && launcher.launchProtocol(a.protocol)) return { ok: true, via: 'app' };
    const preferWeb = a.id === 'nebula' && loadSettings().nebulaMode === 'web';
    const found = preferWeb ? undefined : (a.exe || []).find((p) => { try { return fs.existsSync(p); } catch { return false; } });
    if (found) return { ...(await launcher.launchNative(found, { label: a.name, gaming: a.gaming, fullscreen: a.fullscreen })), via: 'desktop' };
    return { ...launcher.launchUrl(a.url, { tv: a.tv && false, label: a.name, gaming: a.gaming }), via: 'browser' };
  });
  // Windows programs the user added (or built-in apps with a desktop client): launched natively, gaming mode applied.
  handle('launch:exe', (_e, p: string, label: string) => launcher.launchNative(String(p), { label, gaming: true }));
  handle('apps:native', async () => {
    const out: Record<string, { path: string; icon: string }> = {};
    for (const a of STREAMING_APPS) {
      const found = (a.exe || []).find((p) => { try { return fs.existsSync(p); } catch { return false; } });
      if (!found) continue;
      let icon = ''; try { icon = (await app.getFileIcon(found, { size: 'large' })).toDataURL(); } catch { /* no icon */ }
      out[a.id] = { path: found, icon };
    }
    return out;
  });
  handle('apps:icon', async (_e, p: string) => { try { return (await app.getFileIcon(String(p), { size: 'large' })).toDataURL(); } catch { return ''; } });
  handle('launch:vlc', (_e, target: string) => launcher.openInVlc(target));
  handle('launch:browserSetup', (_e, url: string) => launcher.openBrowserSetup(url));
  handle('launch:home', () => launcher.bringTvToFront('manual'));
  handle('launch:browsers', () => launcher.detectBrowsers());
  handle('recents:add', (_e, pid: number, appId: string) => { run('INSERT INTO recent_apps(profile_id,app_id,opened) VALUES (?,?,?) ON CONFLICT(profile_id,app_id) DO UPDATE SET opened=excluded.opened', pid, String(appId).slice(0, 500), Date.now()); });
  handle('recents:apps', (_e, pid: number) => all<any>('SELECT app_id, opened FROM recent_apps WHERE profile_id=? ORDER BY opened DESC LIMIT 12', pid).map((r) => r.app_id));
  handle('open:external', (_e, url: string) => { if (/^https?:\/\//i.test(url)) return shell.openExternal(url); });

  // ---------- display / system ----------
  handle('display:list', () => sys.listDisplays());
  handle('system:info', () => sys.systemInfo());
  handle('system:drives', () => sys.listDrives());
  handle('system:internet', () => sys.checkInternet());
  handle('system:keepAwake', (_e, on: boolean) => sys.keepAwake(on));
  handle('system:battery', () => refreshBattery());
  handle('player:headers', (_e, ua: string, referrer: string) => { streamHeaders.ua = String(ua || '').slice(0, 300); streamHeaders.referrer = /^https?:\/\//i.test(referrer || '') ? referrer : ''; });
  handle('system:sleepPc', () => sys.sleepPc());
  handle('system:quit', () => { app.quit(); });
  handle('system:desktopMode', (_e, on: boolean) => hooks.setDesktopMode(on));
  handle('system:isFullscreen', (e) => !!mainWin(e)?.isFullScreen());
  handle('system:backup', (e) => sys.backup(mainWin(e)));
  handle('system:restore', (e) => sys.restore(mainWin(e)));
  handle('system:logs', () => log.tail(300));
  handle('system:openLogs', () => shell.openPath(path.dirname(logFile())));
  handle('system:checkUpdate', async (_e, feed: string) => {
    if (!app.isPackaged) return { state: 'dev', message: 'Updates are only available in the installed app.' };
    if (!/^https?:\/\//i.test(feed)) return { state: 'error', message: 'Enter the https:// address of your update server first.' };
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    try {
      const r = await autoUpdater.checkForUpdates();
      const v = r?.updateInfo?.version;
      if (v && v !== app.getVersion()) { autoUpdater.once('update-downloaded', () => autoUpdater.quitAndInstall()); return { state: 'downloading', message: `Version ${v} found — downloading. The app will restart to install it.` }; }
      return { state: 'current', message: 'You are on the latest version.' };
    } catch (e: any) { return { state: 'error', message: e?.message || 'Update check failed.' }; }
  });
  handle('fs:exists', (_e, p: string) => { try { return fs.existsSync(p); } catch { return false; } });
}
