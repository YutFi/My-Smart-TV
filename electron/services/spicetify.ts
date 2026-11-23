import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { broadcast, fetchBuffer, fetchJson } from './bus';
import { log } from './log';

// Optional Spotify customisation with the open-source Spicetify project (https://spicetify.app), installed only when the user
// agrees. It adds Spicetify's CLI, the Marketplace (browse/install themes & extensions inside Spotify) and one polished theme
// (Sleek). It deliberately does NOT include any ad-blocking extension — that would circumvent Spotify's ad-supported model.

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const HOME = path.join(LOCAL, 'spicetify');
const CLI = path.join(HOME, 'spicetify.exe');
const SPOTIFY = path.join(ROAMING, 'Spotify', 'Spotify.exe');

export const SCHEMES = ['Deep', 'Deeper', 'UltraBlack', 'Cherry', 'Coral', 'Wealthy', 'Greener', 'Nord'];

function run(file: string, args: string[], timeout = 120000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => execFile(file, args, { windowsHide: true, timeout, maxBuffer: 4_000_000 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim() })));
}

export interface SpicetifyStatus { spotifyInstalled: boolean; installed: boolean; theme: string }

export async function status(): Promise<SpicetifyStatus> {
  const spotifyInstalled = fs.existsSync(SPOTIFY);
  const installed = fs.existsSync(CLI);
  let theme = '';
  if (installed) { const r = await run(CLI, ['config', 'current_theme'], 15000); theme = r.ok ? r.out.split(/\r?\n/).pop() || '' : ''; }
  return { spotifyInstalled, installed, theme };
}

const step = (pct: number, message: string, extra: Record<string, unknown> = {}) => { broadcast('spicetify:progress', { pct, message, ...extra }); log.info(`Spicetify: ${message}`); };

async function download(url: string, digest?: string): Promise<Buffer> {
  if (!/^https:\/\/(github\.com|codeload\.github\.com|objects\.githubusercontent\.com|api\.github\.com)\//.test(url)) throw new Error('Refusing to download from an unexpected address.');
  const buf = await fetchBuffer(url, 180000);
  if (digest?.startsWith('sha256:')) {
    const got = crypto.createHash('sha256').update(buf).digest('hex');
    if (got !== digest.slice(7)) throw new Error('Download failed its integrity check — nothing was installed.');
  }
  return buf;
}

async function unzip(buf: Buffer, dest: string) {
  const tmp = path.join(app.getPath('temp'), `mstv-${Date.now()}.zip`);
  fs.writeFileSync(tmp, buf);
  fs.mkdirSync(dest, { recursive: true });
  const r = await run('tar', ['-xf', tmp, '-C', dest], 120000);
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  if (!r.ok) throw new Error('Could not unpack a download: ' + r.out.slice(0, 200));
}

async function latestAsset(repo: string, match: RegExp) {
  const rel = await fetchJson<any>(`https://api.github.com/repos/${repo}/releases/latest`, 20000);
  const a = (rel.assets || []).find((x: any) => match.test(x.name));
  if (!a) throw new Error(`No download found for ${repo}.`);
  return { url: a.browser_download_url as string, digest: a.digest as string | undefined, version: rel.tag_name as string };
}

export async function install(scheme: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!fs.existsSync(SPOTIFY)) return { ok: false, error: 'Spotify for Windows (the desktop installer from spotify.com/download, not the Microsoft Store version) was not found. Install it, sign in once, then try again.' };
    if (!SCHEMES.includes(scheme)) scheme = 'Deep';

    step(5, 'Closing Spotify…');
    await run('taskkill', ['/IM', 'Spotify.exe', '/F'], 15000);

    step(12, 'Downloading Spicetify…');
    const cli = await latestAsset('spicetify/cli', /windows-x64\.zip$/i);
    await unzip(await download(cli.url, cli.digest), HOME);
    if (!fs.existsSync(CLI)) throw new Error('Spicetify did not unpack correctly.');
    const first = await run(CLI, ['-v'], 20000); // creates the config on first run
    log.info('Spicetify version ' + first.out.split(/\r?\n/)[0]);
    const ud = (await run(CLI, ['path', 'userdata'], 20000)).out.split(/\r?\n/).pop() || '';
    const userdata = /^[A-Za-z]:\\/.test(ud) && !/error/i.test(ud) ? ud : path.join(ROAMING, 'spicetify'); // default config folder

    step(35, 'Downloading the Marketplace…');
    const mp = await latestAsset('spicetify/marketplace', /^marketplace\.zip$/i);
    const mpDir = path.join(userdata, 'CustomApps');
    await unzip(await download(mp.url, mp.digest), mpDir);
    // the archive unpacks as "marketplace-dist"
    const dist = path.join(mpDir, 'marketplace-dist'); const target = path.join(mpDir, 'marketplace');
    if (fs.existsSync(dist)) { fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(dist, target); }

    step(55, 'Downloading the Sleek theme…');
    const themesZip = await download('https://codeload.github.com/spicetify/spicetify-themes/zip/refs/heads/master');
    const tmpThemes = path.join(app.getPath('temp'), `mstv-themes-${Date.now()}`);
    await unzip(themesZip, tmpThemes);
    const root = fs.readdirSync(tmpThemes).map((d) => path.join(tmpThemes, d)).find((d) => fs.existsSync(path.join(d, 'Sleek')));
    if (!root) throw new Error('The theme download was not in the expected format.');
    const themesDir = path.join(userdata, 'Themes');
    fs.mkdirSync(themesDir, { recursive: true });
    fs.cpSync(path.join(root, 'Sleek'), path.join(themesDir, 'Sleek'), { recursive: true, force: true });
    fs.rmSync(tmpThemes, { recursive: true, force: true });

    step(70, 'Applying to Spotify…');
    for (const args of [['config', 'custom_apps', 'marketplace'], ['config', 'current_theme', 'Sleek'], ['config', 'color_scheme', scheme], ['config', 'inject_css', '1', 'replace_colors', '1', 'overwrite_assets', '1']]) {
      const r = await run(CLI, args, 30000); if (!r.ok) throw new Error(`Spicetify config failed: ${r.out.slice(0, 200)}`);
    }
    const bk = await run(CLI, ['backup', 'apply'], 240000);
    if (!bk.ok && !/success|applied|backup/i.test(bk.out)) throw new Error('Spicetify could not patch Spotify: ' + bk.out.slice(-300));

    step(95, 'Starting Spotify…');
    spawnDetached(SPOTIFY);
    step(100, 'Done — Spotify now has the Marketplace and the Sleek theme.', { done: true });
    return { ok: true };
  } catch (e: any) {
    log.error('Spicetify install failed', e);
    step(0, e?.message || 'Installation failed.', { error: true });
    return { ok: false, error: e?.message || 'Installation failed.' };
  }
}

function spawnDetached(exe: string) { try { spawn(exe, [], { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ } }

export async function restore(): Promise<{ ok: boolean; error?: string }> {
  if (!fs.existsSync(CLI)) return { ok: false, error: 'Spicetify is not installed.' };
  await run('taskkill', ['/IM', 'Spotify.exe', '/F'], 15000);
  const r = await run(CLI, ['restore'], 120000);
  if (fs.existsSync(SPOTIFY)) spawnDetached(SPOTIFY);
  return r.ok ? { ok: true } : { ok: false, error: r.out.slice(-300) || 'Restore failed.' };
}

export function openSpotify() { if (fs.existsSync(SPOTIFY)) spawnDetached(SPOTIFY); return fs.existsSync(SPOTIFY); }
