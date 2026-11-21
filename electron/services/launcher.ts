import { app, BrowserWindow, shell } from 'electron';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadSettings } from '../db';
import { log } from './log';
import { broadcast } from './bus';
import { getTargetDisplay } from './system';

// Streaming services rely on Widevine DRM, which stock Electron does not ship. So official sites/apps are opened in the
// PC's own Edge/Chrome (which has Widevine) in a fullscreen app window with a dedicated profile. DRM is never bypassed.

const TV_UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36';

const PF = process.env['ProgramFiles'] || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const LOCAL = process.env['LOCALAPPDATA'] || '';

const EDGE = [path.join(PF86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(PF, 'Microsoft\\Edge\\Application\\msedge.exe')];
const CHROME = [path.join(PF, 'Google\\Chrome\\Application\\chrome.exe'), path.join(PF86, 'Google\\Chrome\\Application\\chrome.exe'), path.join(LOCAL, 'Google\\Chrome\\Application\\chrome.exe')];
const VLC = [path.join(PF, 'VideoLAN\\VLC\\vlc.exe'), path.join(PF86, 'VideoLAN\\VLC\\vlc.exe')];

const firstExisting = (l: string[]) => l.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || '';

export function detectBrowsers() {
  return { edge: firstExisting(EDGE), chrome: firstExisting(CHROME), vlc: firstExisting(VLC) };
}

let child: ChildProcess | null = null;
let childLabel = '';

function pickBrowser(): string {
  const pref = loadSettings().browser;
  const b = detectBrowsers();
  if (pref === 'chrome' && b.chrome) return b.chrome;
  if (pref === 'edge' && b.edge) return b.edge;
  if (pref === 'default') return '';
  return b.edge || b.chrome || '';
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w !== returnWin) || null;
}

// A small always-on-top "back to MY SMART TV" pill shown while an external app/browser/VLC owns the screen, so a touchpad,
// air mouse or phone remote can always get back without a keyboard shortcut.
let returnWin: BrowserWindow | null = null;
const RETURN_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent;overflow:hidden;font-family:'Segoe UI',sans-serif;-webkit-user-select:none">
<a href="mystv://home" style="display:flex;align-items:center;justify-content:center;height:44px;box-sizing:border-box;border-radius:22px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 18px rgba(0,0,0,.55);opacity:.88;letter-spacing:.04em">&#8962;&nbsp; MY SMART TV</a></body>`;

function showReturnButton() {
  if (returnWin && !returnWin.isDestroyed()) return;
  const d = getTargetDisplay();
  returnWin = new BrowserWindow({
    width: 200, height: 48, x: d.bounds.x + 14, y: d.bounds.y + 12, frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false, title: 'MYSTV-RETURN',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  returnWin.setAlwaysOnTop(true, 'screen-saver');
  returnWin.webContents.on('will-navigate', (e, url) => { e.preventDefault(); if (url.startsWith('mystv://')) bringTvToFront('button'); });
  returnWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  returnWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(RETURN_HTML));
  returnWin.once('ready-to-show', () => returnWin?.showInactive());
}
function hideReturnButton() {
  if (returnWin && !returnWin.isDestroyed()) returnWin.destroy();
  returnWin = null;
}

export function bringTvToFront(reason = '') {
  hideReturnButton();
  const w = getMainWindow();
  if (child && child.pid) {
    const pid = child.pid;
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => { /* may already be gone */ });
    child = null;
  }
  if (w) {
    if (w.isMinimized()) w.restore();
    w.show();
    w.setAlwaysOnTop(true);
    w.focus();
    setTimeout(() => !w.isDestroyed() && w.setAlwaysOnTop(false), 600);
    broadcast('tv:foreground', { reason });
  }
}

export function launchUrl(url: string, opts: { tv?: boolean; label?: string } = {}): { ok: boolean; error?: string } {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Only http(s) addresses can be opened.' };
  const exe = pickBrowser();
  if (!exe) {
    shell.openExternal(url).catch(() => undefined);
    return { ok: true };
  }
  if (child && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => undefined);
  const profile = path.join(app.getPath('userData'), 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  const args = [
    `--user-data-dir=${profile}`, `--app=${url}`, '--start-fullscreen', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--disable-features=TranslateUI',
  ];
  if (opts.tv) args.push(`--user-agent=${TV_UA}`);
  try {
    child = spawn(exe, args, { detached: false, stdio: 'ignore' });
    childLabel = opts.label || url;
    const mine = child;
    child.on('exit', () => {
      if (child === mine) { child = null; bringTvToFront('app-exit'); }
    });
    child.on('error', (e) => { log.error('Browser launch failed', e); child = null; bringTvToFront('app-error'); });
    const w = getMainWindow();
    // let the browser take the screen, keep MY SMART TV alive in the background
    setTimeout(() => { if (w && !w.isDestroyed() && child) w.minimize(); }, 900);
    showReturnButton();
    log.info(`Launched ${childLabel} via ${path.basename(exe)}`);
    return { ok: true };
  } catch (e: any) {
    log.error('Launch failed', e);
    return { ok: false, error: e?.message || 'Could not start the browser.' };
  }
}

export function launchProtocol(uri: string): boolean {
  // only well-known, whitelisted protocol handlers
  if (!/^(spotify:|ms-windows-store:)/i.test(uri)) return false;
  shell.openExternal(uri).catch(() => undefined);
  return true;
}

export function openInVlc(target: string): { ok: boolean; error?: string } {
  const vlc = detectBrowsers().vlc;
  if (!vlc) return { ok: false, error: 'VLC was not found. Install VLC from videolan.org to use the VLC engine.' };
  if (child && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => undefined);
  const w = getMainWindow();
  child = spawn(vlc, ['--fullscreen', '--no-video-title-show', '--play-and-exit', target], { stdio: 'ignore' });
  const mine = child;
  child.on('exit', () => { if (child === mine) { child = null; bringTvToFront('vlc-exit'); } });
  setTimeout(() => { if (w && !w.isDestroyed() && child) w.minimize(); }, 800);
  showReturnButton();
  return { ok: true };
}

export function hasExternalApp() { return !!child; }
