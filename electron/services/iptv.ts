import fs from 'node:fs';
import zlib from 'node:zlib';
import { all, get, run, tx, getDb, loadSettings } from '../db';
import { fetchBuffer, broadcast, yieldLoop } from './bus';
import { parseM3U } from './m3u';
import { parseXmltv } from './xmltv';
import { log } from './log';
import type { Channel, Playlist, Programme } from '../../shared/types';

function toText(buf: Buffer): string {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  return buf.toString('utf8');
}

async function readSource(kind: string, source: string): Promise<string> {
  if (kind === 'file') return toText(fs.readFileSync(source));
  return toText(await fetchBuffer(source, 60000));
}

function countryHintFromUrl(url: string): string {
  const m = /countries\/([a-z]{2})\.m3u/i.exec(url);
  return m ? m[1].toUpperCase() : '';
}

const rowToPlaylist = (r: any): Playlist => ({
  id: r.id, name: r.name, source: r.source, kind: r.kind, epgUrl: r.epg_url, autoUpdate: !!r.auto_update,
  updatedAt: r.updated_at, channelCount: r.cnt ?? 0, error: r.error,
});

const rowToChannel = (r: any): Channel => ({
  id: r.id, playlistId: r.playlist_id, num: r.num, name: r.name, logo: r.logo, group: r.grp, category: r.category,
  url: r.url, tvgId: r.tvg_id, country: r.country, catchup: r.catchup, catchupSource: r.catchup_source,
  catchupDays: r.catchup_days, broken: !!r.broken, ua: r.ua, referrer: r.referrer,
});

export function listPlaylists(): Playlist[] {
  return all(`SELECT p.*, (SELECT COUNT(*) FROM channels c WHERE c.playlist_id = p.id) cnt FROM playlists p ORDER BY p.id`).map(rowToPlaylist);
}

export async function addPlaylist(input: { name: string; source: string; kind: 'url' | 'file'; epgUrl?: string }) {
  const existing = get<any>('SELECT id FROM playlists WHERE source=?', input.source);
  const id = existing ? existing.id : Number(run('INSERT INTO playlists(name,source,kind,epg_url) VALUES (?,?,?,?)', input.name || 'Playlist', input.source, input.kind, input.epgUrl || '').lastInsertRowid);
  await refreshPlaylist(id);
  return id;
}

export function removePlaylist(id: number) {
  const ids = all<{ tvg_id: string }>('SELECT tvg_id FROM channels WHERE playlist_id=?', id);
  run('DELETE FROM playlists WHERE id=?', id);
  void ids;
}

export function renamePlaylist(id: number, patch: { name?: string; epgUrl?: string; autoUpdate?: boolean }) {
  if (patch.name !== undefined) run('UPDATE playlists SET name=? WHERE id=?', patch.name, id);
  if (patch.epgUrl !== undefined) run('UPDATE playlists SET epg_url=? WHERE id=?', patch.epgUrl, id);
  if (patch.autoUpdate !== undefined) run('UPDATE playlists SET auto_update=? WHERE id=?', patch.autoUpdate ? 1 : 0, id);
}

export async function refreshPlaylist(id: number): Promise<{ ok: boolean; count: number; error?: string }> {
  const pl = get<any>('SELECT * FROM playlists WHERE id=?', id);
  if (!pl) return { ok: false, count: 0, error: 'Playlist not found' };
  broadcast('iptv:progress', { id, state: 'loading' });
  try {
    const text = await readSource(pl.kind, pl.source);
    if (!/#EXTM3U|#EXTINF/i.test(text)) throw new Error('This does not look like an M3U/M3U8 playlist.');
    const parsed = parseM3U(text, countryHintFromUrl(pl.source));
    if (parsed.channels.length === 0) throw new Error('The playlist contains no playable channels.');
    tx(() => {
      const existing = new Map<string, number>(all<any>('SELECT id,url FROM channels WHERE playlist_id=?', id).map((r) => [r.url, r.id]));
      const seen = new Set<number>();
      const upd = getDb().prepare(`UPDATE channels SET num=?, name=?, logo=?, grp=?, category=?, tvg_id=?, country=?, catchup=?, catchup_source=?, catchup_days=?, ua=?, referrer=? WHERE id=?`);
      const ins = getDb().prepare(`INSERT INTO channels(playlist_id,num,name,logo,grp,category,url,tvg_id,country,catchup,catchup_source,catchup_days,ua,referrer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      parsed.channels.forEach((c, i) => {
        const num = c.chno || i + 1;
        const eid = existing.get(c.url);
        if (eid) { upd.run(num, c.name, c.logo, c.group, c.category, c.tvgId, c.country, c.catchup, c.catchupSource, c.catchupDays, c.ua, c.referrer, eid); seen.add(eid); }
        else ins.run(id, num, c.name, c.logo, c.group, c.category, c.url, c.tvgId, c.country, c.catchup, c.catchupSource, c.catchupDays, c.ua, c.referrer);
      });
      for (const [, cid] of existing) if (!seen.has(cid)) run('DELETE FROM channels WHERE id=?', cid);
      run('UPDATE playlists SET updated_at=?, error=\'\', epg_url=CASE WHEN epg_url=\'\' THEN ? ELSE epg_url END WHERE id=?', Date.now(), parsed.epgUrls[0] || '', id);
    });
    log.info(`Playlist ${pl.name}: ${parsed.channels.length} channels`);
    broadcast('iptv:progress', { id, state: 'done', count: parsed.channels.length });
    return { ok: true, count: parsed.channels.length };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Timed out while downloading the playlist.' : e?.message || String(e);
    run('UPDATE playlists SET error=? WHERE id=?', msg, id);
    log.warn(`Playlist refresh failed (${pl.name})`, msg);
    broadcast('iptv:progress', { id, state: 'error', error: msg });
    return { ok: false, count: 0, error: msg };
  }
}

export async function refreshAll(onlyStale = false) {
  const hours = loadSettings().playlistRefreshHours;
  for (const p of all<any>('SELECT * FROM playlists WHERE auto_update=1')) {
    if (onlyStale && Date.now() - p.updated_at < hours * 3600_000) continue;
    await refreshPlaylist(p.id);
  }
  await refreshEpg().catch((e) => log.warn('EPG refresh failed', e));
}

export interface ChannelQuery { q?: string; category?: string; playlistId?: number; ids?: number[]; limit?: number }

export function listChannels(q: ChannelQuery = {}): Channel[] {
  const where: string[] = []; const params: any[] = [];
  if (q.category && q.category !== 'All') { where.push('category=?'); params.push(q.category); }
  if (q.playlistId) { where.push('playlist_id=?'); params.push(q.playlistId); }
  if (q.q) { where.push('(name LIKE ? OR grp LIKE ?)'); params.push(`%${q.q}%`, `%${q.q}%`); }
  if (q.ids?.length) { where.push(`id IN (${q.ids.map(() => '?').join(',')})`); params.push(...q.ids); }
  const sql = `SELECT * FROM channels ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY playlist_id, num LIMIT ${Math.min(q.limit ?? 8000, 20000)}`;
  return all(sql, ...params).map(rowToChannel);
}

export function channelCategories(): { name: string; count: number }[] {
  return all<any>('SELECT category name, COUNT(*) count FROM channels GROUP BY category ORDER BY count DESC');
}

export function markBroken(id: number, broken: boolean) {
  run('UPDATE channels SET broken=? WHERE id=?', broken ? 1 : 0, id);
}

// ---------------- EPG ----------------
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function refreshEpg(): Promise<{ programmes: number; sources: number }> {
  const urls = new Set<string>(loadSettings().epgUrls.filter(Boolean));
  for (const p of all<any>('SELECT epg_url FROM playlists')) if (p.epg_url) p.epg_url.split(',').forEach((u: string) => urls.add(u.trim()));
  if (urls.size === 0) return { programmes: 0, sources: 0 };
  broadcast('iptv:progress', { epg: 'loading' });
  const from = Date.now() - 6 * 3600_000; const to = Date.now() + 4 * 24 * 3600_000;
  const wanted = new Set<string>(all<any>(`SELECT DISTINCT tvg_id FROM channels WHERE tvg_id != ''`).map((r) => r.tvg_id));
  const nameToId = new Map<string, number>(all<any>('SELECT id,name FROM channels WHERE tvg_id=\'\'').map((r) => [norm(r.name), r.id]));
  let total = 0; let sources = 0;
  const rows: any[] = [];
  for (const u of urls) {
    try {
      const xml = toText(await fetchBuffer(u, 120000));
      // map <channel id=..><display-name> to channels that have no tvg-id
      const chRe = /<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g; let cm: RegExpExecArray | null;
      while ((cm = chRe.exec(xml))) {
        const dn = /<display-name[^>]*>([\s\S]*?)<\/display-name>/.exec(cm[2])?.[1];
        if (!dn) continue;
        const cid = nameToId.get(norm(dn));
        if (cid) { run('UPDATE channels SET tvg_id=? WHERE id=?', cm[1], cid); wanted.add(cm[1]); nameToId.delete(norm(dn)); }
      }
      let n = 0;
      for (const p of parseXmltv(xml, from, to)) {
        if (!wanted.has(p.channel)) continue;
        rows.push(p); n++;
        if (rows.length % 5000 === 0) await yieldLoop();
      }
      total += n; sources++;
    } catch (e: any) {
      log.warn(`EPG source failed: ${u}`, e?.message);
    }
  }
  if (sources > 0) {
    tx(() => {
      run('DELETE FROM epg');
      const ins = getDb().prepare('INSERT INTO epg(channel,start,stop,title,descr) VALUES (?,?,?,?,?)');
      for (const p of rows) ins.run(p.channel, p.start, p.stop, p.title, p.desc);
    });
  }
  log.info(`EPG: ${total} programmes from ${sources}/${urls.size} sources`);
  broadcast('iptv:progress', { epg: 'done', programmes: total });
  return { programmes: total, sources };
}

export function epgNow(tvgIds: string[]): Record<string, { now?: Programme; next?: Programme }> {
  const out: Record<string, { now?: Programme; next?: Programme }> = {};
  if (!tvgIds.length) return out;
  const t = Date.now();
  const ph = tvgIds.map(() => '?').join(',');
  const rows = all<any>(`SELECT channel,start,stop,title,descr FROM epg WHERE channel IN (${ph}) AND stop > ? AND start < ? ORDER BY start`, ...tvgIds, t, t + 8 * 3600_000);
  for (const r of rows) {
    const p: Programme = { channel: r.channel, start: r.start, stop: r.stop, title: r.title, desc: r.descr };
    const e = (out[r.channel] ||= {});
    if (r.start <= t && r.stop > t) e.now = p; else if (r.start > t && !e.next) e.next = p;
  }
  return out;
}

export function epgRange(tvgIds: string[], from: number, to: number): Record<string, Programme[]> {
  const out: Record<string, Programme[]> = {};
  if (!tvgIds.length) return out;
  const ph = tvgIds.map(() => '?').join(',');
  for (const r of all<any>(`SELECT channel,start,stop,title,descr FROM epg WHERE channel IN (${ph}) AND stop > ? AND start < ? ORDER BY start`, ...tvgIds, from, to)) {
    (out[r.channel] ||= []).push({ channel: r.channel, start: r.start, stop: r.stop, title: r.title, desc: r.descr });
  }
  return out;
}

export function epgSearch(q: string): (Programme & { channelId: number; channelName: string })[] {
  const rows = all<any>(
    `SELECT e.channel,e.start,e.stop,e.title,e.descr,c.id cid,c.name cname FROM epg e JOIN channels c ON c.tvg_id=e.channel
     WHERE e.title LIKE ? AND e.stop > ? ORDER BY e.start LIMIT 30`, `%${q}%`, Date.now());
  return rows.map((r) => ({ channel: r.channel, start: r.start, stop: r.stop, title: r.title, desc: r.descr, channelId: r.cid, channelName: r.cname }));
}

// Catch-up / timeshift URL for providers that advertise it in their playlist.
export function catchupUrl(channelId: number, startMs: number, endMs: number): string | null {
  const c = get<any>('SELECT * FROM channels WHERE id=?', channelId);
  if (!c || !c.catchup) return null;
  const startS = Math.floor(startMs / 1000); const endS = Math.floor(endMs / 1000);
  const dur = endS - startS; const nowS = Math.floor(Date.now() / 1000);
  const fmt = (ms: number, f: string) => {
    const d = new Date(ms);
    const p = (n: number, l = 2) => String(n).padStart(l, '0');
    return f.replace('Y', String(d.getUTCFullYear())).replace('m', p(d.getUTCMonth() + 1)).replace('d', p(d.getUTCDate()))
      .replace('H', p(d.getUTCHours())).replace('M', p(d.getUTCMinutes())).replace('S', p(d.getUTCSeconds()));
  };
  const fill = (tpl: string) => tpl
    .replace(/\$\{start\}|\{utc\}|\$\{timestamp\}/g, String(startS)).replace(/\$\{end\}|\{utcend\}/g, String(endS))
    .replace(/\$\{offset\}|\{offset\}/g, String(nowS - startS)).replace(/\$\{duration\}|\{duration\}/g, String(dur))
    .replace(/\$\{now\}|\{lutc\}/g, String(nowS))
    .replace(/\{Y\}\{m\}\{d\}\{H\}\{M\}\{S\}|\$\{start:YmdHMS\}/g, fmt(startMs, 'YmdHMS'));
  switch (c.catchup) {
    case 'append': return c.url + fill(c.catchup_source || '?utc=${start}&lutc=${now}');
    case 'shift': return c.url + (c.url.includes('?') ? '&' : '?') + `utc=${startS}&lutc=${nowS}`;
    case 'flussonic': case 'fs': return c.url.replace(/\/(index|mpegts|video).*$/, '') + `/archive-${startS}-${dur}.m3u8`;
    case 'default': default: return c.catchup_source ? fill(c.catchup_source) : null;
  }
}
