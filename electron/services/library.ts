import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, getDb } from '../db';
import { broadcast, yieldLoop } from './bus';
import * as tmdb from './tmdb';
import { log } from './log';
import type { LibraryFolder, MediaItem } from '../../shared/types';

const VIDEO = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.ts', '.mpg', '.mpeg', '.flv']);
const AUDIO = new Set(['.mp3', '.aac', '.flac', '.m4a', '.wav', '.ogg', '.opus', '.wma']);
const SUBS = new Set(['.srt', '.vtt']);

export function listFolders(): LibraryFolder[] {
  return all<any>('SELECT f.id,f.path,f.kind,(SELECT COUNT(*) FROM media m WHERE m.folder_id=f.id) c FROM folders f ORDER BY f.id')
    .map((r) => ({ id: r.id, path: r.path, kind: r.kind, itemCount: r.c }));
}

export async function addFolder(p: string, kind: LibraryFolder['kind']) {
  if (!fs.existsSync(p)) throw new Error('Folder not found: ' + p);
  const r = get<any>('SELECT id FROM folders WHERE path=?', p);
  const id = r ? r.id : Number(run('INSERT INTO folders(path,kind) VALUES (?,?)', p, kind).lastInsertRowid);
  if (r) run('UPDATE folders SET kind=? WHERE id=?', kind, id);
  await scanFolder(id);
  return id;
}

export function removeFolder(id: number) { run('DELETE FROM folders WHERE id=?', id); }

function* walk(dir: string, depth = 0): Generator<string> {
  if (depth > 8) return;
  let ents: fs.Dirent[] = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') || e.name === '$RECYCLE.BIN' || e.name === 'System Volume Information') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, depth + 1);
    else yield full;
  }
}

const clean = (s: string) => s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/\[[^\]]*\]|\((?!\d{4}\))[^)]*\)/g, '').trim();

export function parseName(file: string, folderKind: string) {
  const base = path.basename(file, path.extname(file));
  const ep = /^(.*?)[ ._-]*[sS](\d{1,2})[ ._-]?[eE](\d{1,3})/.exec(base) || /^(.*?)[ ._-]*(\d{1,2})x(\d{2,3})\b/.exec(base);
  if (ep) {
    let show = clean(ep[1]);
    if (!show) show = clean(path.basename(path.dirname(path.dirname(file)))) || clean(path.basename(path.dirname(file)));
    return { kind: 'episode' as const, title: `${show} S${ep[2].padStart(2, '0')}E${ep[3].padStart(2, '0')}`, show, season: +ep[2], episode: +ep[3], year: 0 };
  }
  const yr = /[ ._(\[-](19\d{2}|20\d{2})[ ._)\]-]?/.exec(base);
  const title = clean(yr ? base.slice(0, yr.index) : base.replace(/\b(1080p|720p|2160p|4k|bluray|brrip|webrip|web-dl|x264|x265|hevc|h264)\b.*$/i, ''));
  return { kind: 'movie' as const, title: title || clean(base), show: '', season: 0, episode: 0, year: yr ? +yr[1] : 0 };
}

export async function scanFolder(id: number) {
  const f = get<any>('SELECT * FROM folders WHERE id=?', id);
  if (!f) return;
  broadcast('library:progress', { id, state: 'scanning' });
  const found: any[] = []; let n = 0;
  const subsByDir = new Map<string, string[]>();
  for (const file of walk(f.path)) {
    const ext = path.extname(file).toLowerCase();
    if (SUBS.has(ext)) { const d = path.dirname(file); (subsByDir.get(d) || subsByDir.set(d, []).get(d)!).push(file); continue; }
    const isV = VIDEO.has(ext); const isA = AUDIO.has(ext);
    if (!isV && !isA) continue;
    let size = 0; try { size = fs.statSync(file).size; } catch { /* ignore */ }
    if (isA || f.kind === 'music') found.push({ path: file, title: path.basename(file, ext).replace(/_/g, ' '), kind: 'music', year: 0, show: path.basename(path.dirname(file)), season: 0, episode: 0, size });
    else if (f.kind === 'videos') found.push({ path: file, title: clean(path.basename(file, ext)), kind: 'video', year: 0, show: '', season: 0, episode: 0, size });
    else {
      const p = parseName(file, f.kind);
      found.push({ path: file, ...p, size });
    }
    if (++n % 200 === 0) await yieldLoop();
  }
  tx(() => {
    const ins = getDb().prepare(`INSERT INTO media(folder_id,path,title,kind,year,show_name,season,episode,size,added) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(path) DO UPDATE SET title=excluded.title, kind=excluded.kind, year=excluded.year, show_name=excluded.show_name, season=excluded.season, episode=excluded.episode, size=excluded.size`);
    const seen = new Set<string>();
    for (const m of found) { ins.run(id, m.path, m.title, m.kind, m.year, m.show, m.season, m.episode, m.size, Date.now()); seen.add(m.path); }
    for (const r of all<any>('SELECT id,path FROM media WHERE folder_id=?', id)) if (!seen.has(r.path)) run('DELETE FROM media WHERE id=?', r.id);
  });
  log.info(`Library ${f.path}: ${found.length} items`);
  broadcast('library:progress', { id, state: 'done', count: found.length });
  void enrich(id, subsByDir);
}

// Adds posters/overviews from TMDB for movies and shows, when the user has configured a key.
async function enrich(folderId: number, _subs: Map<string, string[]>) {
  if (!tmdb.hasKey()) return;
  const movies = all<any>(`SELECT id,title,year FROM media WHERE folder_id=? AND kind='movie' AND tmdb_id=0 LIMIT 300`, folderId);
  for (const m of movies) {
    const t = await tmdb.findByName(m.title, m.year, 'movie');
    run('UPDATE media SET tmdb_id=?, poster=?, backdrop=?, overview=?, year=CASE WHEN year=0 THEN ? ELSE year END WHERE id=?', t ? t.id : -1, t?.poster || '', t?.backdrop || '', t?.overview || '', t?.year || 0, m.id);
  }
  const shows = all<any>(`SELECT DISTINCT show_name FROM media WHERE folder_id=? AND kind='episode' AND tmdb_id=0 LIMIT 100`, folderId);
  for (const s of shows) {
    const t = await tmdb.findByName(s.show_name, 0, 'tv');
    run(`UPDATE media SET tmdb_id=?, poster=?, backdrop=?, overview=? WHERE folder_id=? AND kind='episode' AND show_name=?`, t ? t.id : -1, t?.poster || '', t?.backdrop || '', t?.overview || '', folderId, s.show_name);
  }
  broadcast('library:progress', { id: folderId, state: 'enriched' });
}

const rowToItem = (r: any): MediaItem => ({
  id: r.id, folderId: r.folder_id, path: r.path, title: r.title, kind: r.kind, year: r.year, show: r.show_name, season: r.season,
  episode: r.episode, poster: r.poster, backdrop: r.backdrop, overview: r.overview, tmdbId: r.tmdb_id, size: r.size, subs: [],
});

export function listMedia(q: { kind?: string; q?: string; show?: string; limit?: number } = {}): MediaItem[] {
  const w: string[] = []; const p: any[] = [];
  if (q.kind) { w.push('kind=?'); p.push(q.kind); }
  if (q.show) { w.push('show_name=?'); p.push(q.show); }
  if (q.q) { w.push('(title LIKE ? OR show_name LIKE ?)'); p.push(`%${q.q}%`, `%${q.q}%`); }
  return all(`SELECT * FROM media ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY show_name, season, episode, title LIMIT ${q.limit ?? 3000}`, ...p).map(rowToItem);
}

export function getMedia(id: number): MediaItem | null {
  const r = get<any>('SELECT * FROM media WHERE id=?', id);
  if (!r) return null;
  const item = rowToItem(r);
  // adjacent subtitle files with the same base name
  try {
    const dir = path.dirname(r.path); const base = path.basename(r.path, path.extname(r.path)).toLowerCase();
    item.subs = fs.readdirSync(dir).filter((f) => SUBS.has(path.extname(f).toLowerCase()) && f.toLowerCase().startsWith(base)).map((f) => path.join(dir, f));
  } catch { /* ignore */ }
  return item;
}

export function nextEpisode(id: number): MediaItem | null {
  const cur = get<any>('SELECT * FROM media WHERE id=?', id);
  if (!cur || cur.kind !== 'episode') return null;
  const n = get<any>(`SELECT * FROM media WHERE show_name=? AND kind='episode' AND (season>? OR (season=? AND episode>?)) ORDER BY season, episode LIMIT 1`, cur.show_name, cur.season, cur.season, cur.episode);
  return n ? rowToItem(n) : null;
}

export function showsList(): { name: string; poster: string; backdrop: string; overview: string; tmdbId: number; episodes: number; seasons: number }[] {
  return all<any>(`SELECT show_name name, MAX(poster) poster, MAX(backdrop) backdrop, MAX(overview) overview, MAX(tmdb_id) tmdbId, COUNT(*) episodes, COUNT(DISTINCT season) seasons FROM media WHERE kind='episode' GROUP BY show_name ORDER BY show_name`);
}

export function readSubtitle(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (!SUBS.has(ext)) throw new Error('Not a subtitle file');
  return fs.readFileSync(p, 'utf8');
}
