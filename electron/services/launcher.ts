import { app, BrowserWindow, shell } from 'electron';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadSettings } from '../db';
import { log } from './log';
import { broadcast } from './bus';
import { getTargetDisplay } from './system';
import { enter as enterGaming, exit as exitGaming } from './gaming';
import { launchShellApp } from './apps';
import { currentBattery, onBattery, type BatteryInfo } from './battery';
import FULLSCREEN_PS from '../ps/fullscreen.ps1';

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
// The pill also shows the clock and (on laptops/tablets) the battery level, because a full-screen app hides the taskbar.
const RETURN_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent;overflow:hidden;font-family:'Segoe UI',sans-serif;-webkit-user-select:none">
<style>#bar{display:inline-flex;gap:8px;height:44px;opacity:.6;transition:opacity .25s}body:hover #bar{opacity:1}
#st{display:flex;align-items:center;gap:10px;height:44px;box-sizing:border-box;padding:0 16px;border-radius:22px;background:rgba(10,13,31,.84);border:1px solid rgba(255,255,255,.14);color:#fff;font-weight:700;font-size:15px;box-shadow:0 4px 18px rgba(0,0,0,.55);white-space:nowrap}
.bt{display:inline-block;position:relative;width:26px;height:12px;border:2px solid #fff;border-radius:3px}.bt:after{content:'';position:absolute;right:-5px;top:2px;width:3px;height:6px;background:#fff;border-radius:0 2px 2px 0}.bt i{position:absolute;left:1px;top:1px;bottom:1px;border-radius:1px}</style>
<div id="bar"><a href="mystv://home" style="display:flex;align-items:center;justify-content:center;height:44px;box-sizing:border-box;padding:0 18px;border-radius:22px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 18px rgba(0,0,0,.55);letter-spacing:.04em;white-space:nowrap">&#8962;&nbsp; MY SMART TV</a>
<div id="st"><span id="bat" style="display:none;align-items:center;gap:7px"></span><span id="clk" style="min-width:62px;text-align:right"></span></div></div>
<script>
function f(){document.getElementById('clk').textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}f();setInterval(f,1000);
window.__set=function(b){var el=document.getElementById('bat');
if(!b||!b.present){el.style.display='none'}else{var c=b.charging||b.percent>50?'#34d399':b.percent>20?'#fbbf24':'#f87171';
el.style.display='inline-flex';el.innerHTML='<span class="bt"><i style="width:'+Math.max(2,Math.round(b.percent*0.22))+'px;background:'+c+'"></i></span><span style="color:'+c+'">'+b.percent+'%'+(b.charging?' &#9889;':'')+'</span>'}
return Math.ceil(document.getElementById('bar').getBoundingClientRect().width)+6};
</script></body>`;

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
  returnWin.webContents.once('did-finish-load', () => void pushStatus(currentBattery()));
  returnWin.once('ready-to-show', () => returnWin?.showInactive());
  unsubBattery?.(); unsubBattery = onBattery((b) => void pushStatus(b));
  statusTimer = setInterval(() => void pushStatus(currentBattery()), 30_000);
}
let unsubBattery: (() => void) | null = null;
let statusTimer: NodeJS.Timeout | null = null;

// Update the pill's battery text and resize the (transparent) window to fit, so it never blocks more of the app than needed.
async function pushStatus(b: BatteryInfo) {
  const w = returnWin;
  if (!w || w.isDestroyed()) return;
  try {
    const width = Number(await w.webContents.executeJavaScript(`window.__set(${JSON.stringify(b)})`));
    if (width > 0 && !w.isDestroyed()) { const bounds = w.getBounds(); w.setBounds({ x: bounds.x, y: bounds.y, width, height: 48 }); }
  } catch { /* page not ready yet */ }
}
function hideReturnButton() {
  unsubBattery?.(); unsubBattery = null;
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
  if (returnWin && !returnWin.isDestroyed()) returnWin.destroy();
  returnWin = null;
}

let nativeWatch: NodeJS.Timeout | null = null;

export function bringTvToFront(reason = '') {
  hideReturnButton();
  if (nativeWatch) { clearInterval(nativeWatch); nativeWatch = null; }
  void exitGaming();
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

// Launch an installed Windows program (e.g. the Nebula desktop client). ShellExecute is used so programs that need
// elevation show Windows' normal prompt. MY SMART TV steps aside and returns when the program's process ends.
// Borderless full-screen helper (see electron/ps/fullscreen.ps1) — only touches the launched program's own window.
function goFullscreen(procName: string) {
  try {
    const file = path.join(app.getPath('userData'), 'fullscreen.ps1');
    fs.writeFileSync(file, FULLSCREEN_PS);
    const c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-Name', procName, '-Seconds', '60'], { windowsHide: true, stdio: 'ignore' });
    c.unref();
  } catch (e) { log.warn('Fullscreen helper failed', e); }
}

export async function launchNative(exe: string, opts: { label?: string; gaming?: boolean; fullscreen?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!/\.exe$/i.test(exe) || !fs.existsSync(exe)) return { ok: false, error: `Program not found: ${exe}` };
  if (child && child.pid) { execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => undefined); child = null; }
  if (nativeWatch) { clearInterval(nativeWatch); nativeWatch = null; }
  const err = await shell.openPath(exe);
  if (err) { log.error(`Could not start ${exe}: ${err}`); return { ok: false, error: err }; }
  log.info(`Launched ${opts.label || exe}`);
  if (opts.gaming) await enterGaming(opts.label || path.basename(exe));
  const name = path.basename(exe);
  if (opts.fullscreen) goFullscreen(name.replace(/\.exe$/i, ''));
  const w = getMainWindow();
  setTimeout(() => { if (w && !w.isDestroyed()) w.minimize(); }, 1200);
  showReturnButton();
  const started = Date.now(); let seen = false; let misses = 0;
  nativeWatch = setInterval(() => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH', '/FO', 'CSV'], { windowsHide: true }, (e, out) => {
      const running = !e && String(out).toLowerCase().includes(name.toLowerCase());
      if (running) { seen = true; misses = 0; return; }
      misses++;
      if ((seen && misses >= 2) || (!seen && Date.now() - started > 60000)) bringTvToFront('program-exit');
    });
  }, 3000);
  return { ok: true };
}

export function launchUrl(url: string, opts: { tv?: boolean; label?: string; gaming?: boolean } = {}): { ok: boolean; error?: string } {
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
    if (opts.gaming) void enterGaming(opts.label || url);
    log.info(`Launched ${childLabel} via ${path.basename(exe)}`);
    return { ok: true };
  } catch (e: any) {
    log.error('Launch failed', e);
    return { ok: false, error: e?.message || 'Could not start the browser.' };
  }
}

// Opens the streaming browser profile as a normal window (with toolbar + extensions) so the user can install an ad blocker
// or sign in once. Extensions installed here also apply to the full-screen app windows, which share the profile.
export function openBrowserSetup(url: string): { ok: boolean; error?: string } {
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Only https addresses can be opened.' };
  const b = detectBrowsers();
  const exe = b.edge || b.chrome;
  if (!exe) { shell.openExternal(url).catch(() => undefined); return { ok: true }; }
  const profile = path.join(app.getPath('userData'), 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  const w = getMainWindow();
  if (child && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => undefined);
  const mine = spawn(exe, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--new-window', url], { stdio: 'ignore' });
  child = mine; childLabel = 'Browser setup';
  mine.on('exit', () => { if (child === mine) { child = null; bringTvToFront('browser-closed'); } });
  mine.on('error', () => { if (child === mine) { child = null; bringTvToFront('browser-error'); } });
  setTimeout(() => { if (w && !w.isDestroyed()) w.minimize(); }, 900);
  showReturnButton();
  return { ok: true };
}

// Start-menu / Microsoft Store app: MY SMART TV steps aside and the floating pill brings the user back.
export function launchShell(appId: string): { ok: boolean; error?: string } {
  const r = launchShellApp(appId);
  if (!r.ok) return r;
  if (child && child.pid) { execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => undefined); child = null; }
  const w = getMainWindow();
  setTimeout(() => { if (w && !w.isDestroyed()) w.minimize(); }, 1800);
  showReturnButton();
  return r;
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
