import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
// node:sqlite ships with Node 22.5+/Electron 35+ — a real SQLite engine with no native build step.
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

let db: DatabaseSync;

export function dbPath() {
  return path.join(app.getPath('userData'), 'mysmarttv.db');
}

export function initDb() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
  db.exec(`
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '😀',
    color TEXT NOT NULL DEFAULT '#8b5cf6', pin_hash TEXT NOT NULL DEFAULT '', kids INTEGER NOT NULL DEFAULT 0,
    max_rating TEXT NOT NULL DEFAULT 'all', blocked TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL,
    epg_url TEXT NOT NULL DEFAULT '', auto_update INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    num INTEGER NOT NULL, name TEXT NOT NULL, logo TEXT NOT NULL DEFAULT '', grp TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'International', url TEXT NOT NULL, tvg_id TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '', catchup TEXT NOT NULL DEFAULT '', catchup_source TEXT NOT NULL DEFAULT '',
    catchup_days INTEGER NOT NULL DEFAULT 0, broken INTEGER NOT NULL DEFAULT 0,
    ua TEXT NOT NULL DEFAULT '', referrer TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_channels_pl ON channels(playlist_id);
  CREATE INDEX IF NOT EXISTS idx_channels_cat ON channels(category);
  CREATE TABLE IF NOT EXISTS epg (
    channel TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, title TEXT NOT NULL, descr TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_epg_ch ON epg(channel, start);
  CREATE TABLE IF NOT EXISTS lists (
    profile_id INTEGER NOT NULL, list TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL,
    title TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', sub TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}',
    added INTEGER NOT NULL, PRIMARY KEY (profile_id, list, kind, ref)
  );
  CREATE TABLE IF NOT EXISTS history (
    profile_id INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, title TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT '', sub TEXT NOT NULL DEFAULT '', position REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}', updated INTEGER NOT NULL,
    PRIMARY KEY (profile_id, kind, ref)
  );
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL UNIQUE, kind TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT, folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, kind TEXT NOT NULL, year INTEGER NOT NULL DEFAULT 0,
    show_name TEXT NOT NULL DEFAULT '', season INTEGER NOT NULL DEFAULT 0, episode INTEGER NOT NULL DEFAULT 0,
    poster TEXT NOT NULL DEFAULT '', backdrop TEXT NOT NULL DEFAULT '', overview TEXT NOT NULL DEFAULT '',
    tmdb_id INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_media_folder ON media(folder_id);
  CREATE TABLE IF NOT EXISTS recent_apps (
    profile_id INTEGER NOT NULL, app_id TEXT NOT NULL, opened INTEGER NOT NULL, PRIMARY KEY (profile_id, app_id)
  );
  `);
  db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES ('schema','1')").run();
  // first run: create a default profile
  const n = (db.prepare('SELECT COUNT(*) c FROM profiles').get() as any).c;
  if (n === 0) {
    db.prepare('INSERT INTO profiles(name,avatar,color,created) VALUES (?,?,?,?)').run('Family', '🎬', '#8b5cf6', Date.now());
  }
  return db;
}

export function getDb() {
  return db;
}

export function closeDb() {
  try { db?.close(); } catch { /* ignore */ }
}

export function all<T = any>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function get<T = any>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- settings ----------
export function loadSettings(): Settings {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out: any = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { /* skip bad value */ }
  }
  return out as Settings;
}

export function saveSettings(patch: Partial<Settings>) {
  tx(() => {
    const st = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for (const [k, v] of Object.entries(patch)) st.run(k, JSON.stringify(v));
  });
}
