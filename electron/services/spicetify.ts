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
//
// Spicetify can only patch the regular Spotify desktop app (%APPDATA%\Spotify). The Microsoft Store edition of Spotify lives in
// the protected WindowsApps folder and cannot be modified, so — with the user's explicit agreement — it is replaced by the
// official desktop edition (same account, same music) before Spicetify is applied.

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const HOME = path.join(LOCAL, 'spicetify');
const CLI = path.join(HOME, 'spicetify.exe');
const SPOTIFY_DIR = path.join(ROAMING, 'Spotify');
const SPOTIFY = path.join(SPOTIFY_DIR, 'Spotify.exe');
const PREFS = path.join(SPOTIFY_DIR, 'prefs');
const USERDATA = path.join(ROAMING, 'spicetify');
const SPOTIFY_SETUP_URL = 'https://download.scdn.co/SpotifyFullSetup.exe'; // Spotify's own installer

export const SCHEMES = ['Deep', 'Deeper', 'UltraBlack', 'Cherry', 'Coral', 'Wealthy', 'Greener', 'Nord'];

function run(file: string, args: string[], timeout = 120000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => execFile(file, args, { windowsHide: true, timeout, maxBuffer: 4_000_000 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim() })));
}
const ps = (cmd: string, timeout = 60000) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], timeout);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SpicetifyStatus { spotifyInstalled: boolean; storeVersion: boolean; installed: boolean; theme: string }

async function hasStoreSpotify(): Promise<boolean> {
  const r = await ps('(Get-AppxPackage -Name SpotifyAB.SpotifyMusic | Measure-Object).Count', 20000);
  return r.ok && Number(r.out.trim()) > 0;
}

export async function status(): Promise<SpicetifyStatus> {
  const spotifyInstalled = fs.existsSync(SPOTIFY);
  const installed = fs.existsSync(CLI);
  let theme = '';
  if (installed) { const r = await run(CLI, ['config', 'current_theme'], 15000); theme = r.ok ? r.out.split(/\r?\n/).pop() || '' : ''; }
  return { spotifyInstalled, storeVersion: await hasStoreSpotify(), installed, theme };
}

const step = (pct: number, message: string, extra: Record<string, unknown> = {}) => { broadcast('spicetify:progress', { pct, message, ...extra }); log.info(`Spicetify: ${message}`); };

async function download(url: string, digest?: string): Promise<Buffer> {
  if (!/^https:\/\/(github\.com|codeload\.github\.com|objects\.githubusercontent\.com|api\.github\.com|download\.scdn\.co)\//.test(url)) throw new Error('Refusing to download from an unexpected address.');
  const buf = await fetchBuffer(url, 240000);
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

const startSpotify = () => { try { spawn(SPOTIFY, [], { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ } };

// Replace the Store edition (or install from scratch) with the regular desktop edition from Spotify.
async function ensureDesktopSpotify(replaceStore: boolean) {
  if (fs.existsSync(SPOTIFY)) return;
  const store = await hasStoreSpotify();
  if (store && !replaceStore) throw new Error('STORE_VERSION');

  step(6, 'Closing Spotify…');
  await run('taskkill', ['/IM', 'Spotify.exe', '/F'], 15000);
  if (store) {
    step(9, 'Removing the Microsoft Store edition of Spotify…');
    const r = await ps('Get-AppxPackage -Name SpotifyAB.SpotifyMusic | Remove-AppxPackage', 120000);
    if (!r.ok) throw new Error('Could not remove the Microsoft Store edition of Spotify: ' + r.out.slice(0, 200));
  }
  step(14, 'Downloading Spotify for Windows from Spotify…');
  const setupPath = path.join(app.getPath('temp'), 'SpotifyFullSetup.exe');
  fs.writeFileSync(setupPath, await download(SPOTIFY_SETUP_URL));
  const sig = await ps(`$s = Get-AuthenticodeSignature -LiteralPath '${setupPath.replace(/'/g, "''")}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`, 30000);
  if (!/^Valid\|.*Spotify/i.test(sig.out.trim())) { try { fs.unlinkSync(setupPath); } catch { /* ignore */ } throw new Error('The Spotify installer failed its signature check — nothing was installed.'); }
  step(22, 'Installing Spotify for Windows…');
  await run(setupPath, ['/silent'], 240000);
  try { fs.unlinkSync(setupPath); } catch { /* ignore */ }
  for (let i = 0; i < 60 && !fs.existsSync(SPOTIFY); i++) await sleep(2000);
  if (!fs.existsSync(SPOTIFY)) throw new Error('Spotify did not finish installing. Try installing it from spotify.com/download, then run this again.');
}

// Spicetify needs Spotify's "prefs" file, which exists once Spotify has been started once.
async function ensurePrefs() {
  if (fs.existsSync(PREFS)) return;
  step(30, 'Starting Spotify once to create its settings…');
  startSpotify();
  for (let i = 0; i < 30 && !fs.existsSync(PREFS); i++) await sleep(2000);
  await run('taskkill', ['/IM', 'Spotify.exe', '/F'], 15000);
  await sleep(1500);
  if (!fs.existsSync(PREFS)) throw new Error('Spotify has not created its settings yet. Open Spotify once, sign in, close it, then run this again.');
}

export async function install(scheme: string, replaceStore = false): Promise<{ ok: boolean; error?: string; needsReplace?: boolean }> {
  try {
    if (!SCHEMES.includes(scheme)) scheme = 'Deep';
    await ensureDesktopSpotify(replaceStore);
    await ensurePrefs();
    await run('taskkill', ['/IM', 'Spotify.exe', '/F'], 15000);

    step(36, 'Downloading Spicetify…');
    const cli = await latestAsset('spicetify/cli', /windows-x64\.zip$/i);
    await unzip(await download(cli.url, cli.digest), HOME);
    if (!fs.existsSync(CLI)) throw new Error('Spicetify did not unpack correctly.');
    const first = await run(CLI, ['-v'], 20000);
    log.info('Spicetify version ' + first.out.split(/\r?\n/)[0]);

    // An older Spicetify setup (for example one pointing at the Store edition) must not leak into this one.
    step(44, 'Pointing Spicetify at the Spotify desktop app…');
    for (const d of ['Backup', 'Extracted']) { try { fs.rmSync(path.join(USERDATA, d), { recursive: true, force: true }); } catch { /* ignore */ } }
    const cfg = await run(CLI, ['config', 'spotify_path', SPOTIFY_DIR, 'prefs_path', PREFS], 30000);
    if (!cfg.ok) throw new Error('Spicetify could not use the Spotify folder: ' + cfg.out.slice(0, 200));

    step(50, 'Downloading the Marketplace…');
    const mp = await latestAsset('spicetify/marketplace', /^marketplace\.zip$/i);
    const mpDir = path.join(USERDATA, 'CustomApps');
    await unzip(await download(mp.url, mp.digest), mpDir);
    const dist = path.join(mpDir, 'marketplace-dist'); const target = path.join(mpDir, 'marketplace');
    if (fs.existsSync(dist)) { fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(dist, target); }

    step(60, 'Downloading the Sleek theme…');
    const themesZip = await download('https://codeload.github.com/spicetify/spicetify-themes/zip/refs/heads/master');
    const tmpThemes = path.join(app.getPath('temp'), `mstv-themes-${Date.now()}`);
    await unzip(themesZip, tmpThemes);
    const root = fs.readdirSync(tmpThemes).map((d) => path.join(tmpThemes, d)).find((d) => fs.existsSync(path.join(d, 'Sleek')));
    if (!root) throw new Error('The theme download was not in the expected format.');
    const themesDir = path.join(USERDATA, 'Themes');
    fs.mkdirSync(themesDir, { recursive: true });
    fs.cpSync(path.join(root, 'Sleek'), path.join(themesDir, 'Sleek'), { recursive: true, force: true });
    fs.rmSync(tmpThemes, { recursive: true, force: true });

    step(72, 'Applying to Spotify…');
    for (const args of [['config', 'custom_apps', 'marketplace'], ['config', 'current_theme', 'Sleek'], ['config', 'color_scheme', scheme], ['config', 'inject_css', '1', 'replace_colors', '1', 'overwrite_assets', '1']]) {
      const r = await run(CLI, args, 30000); if (!r.ok) throw new Error(`Spicetify config failed: ${r.out.slice(0, 200)}`);
    }
    const bk = await run(CLI, ['backup', 'apply'], 240000);
    log.info('spicetify backup apply: ' + bk.out.slice(-400));
    if (!bk.ok && !/success|applied|backup/i.test(bk.out)) throw new Error('Spicetify could not patch Spotify: ' + bk.out.slice(-300));

    step(96, 'Starting Spotify…');
    startSpotify();
    step(100, 'Done — Spotify now has the Marketplace and the Sleek theme.', { done: true });
    return { ok: true };
  } catch (e: any) {
    if (e?.message === 'STORE_VERSION') {
      step(0, 'Your Spotify is the Microsoft Store edition, which cannot be customised. Agree to replace it with the regular Spotify desktop app and try again.', { error: true });
      return { ok: false, needsReplace: true, error: 'STORE_VERSION' };
    }
    log.error('Spicetify install failed', e);
    step(0, e?.message || 'Installation failed.', { error: true });
    return { ok: false, error: e?.message || 'Installation failed.' };
  }
}

export async function restore(): Promise<{ ok: boolean; error?: string }> {
  if (!fs.existsSync(CLI)) return { ok: false, error: 'Spicetify is not installed.' };
  await run('taskkill', ['/IM', 'Spotify.exe', '/F'], 15000);
  const r = await run(CLI, ['restore'], 120000);
  if (fs.existsSync(SPOTIFY)) startSpotify();
  return r.ok ? { ok: true } : { ok: false, error: r.out.slice(-300) || 'Restore failed.' };
}

export function openSpotify() { if (fs.existsSync(SPOTIFY)) { startSpotify(); return true; } return false; }
