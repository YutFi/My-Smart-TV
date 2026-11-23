import { app, BrowserWindow, Menu, protocol, net, screen, session, globalShortcut, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initDb, closeDb, loadSettings, all } from './db';
import { registerIpc, allowedFiles } from './ipc';
import { log } from './services/log';
import { applyPendingRestore, getTargetDisplay, placeWindow } from './services/system';
import { bringTvToFront } from './services/launcher';
import { refreshAll } from './services/iptv';
import { broadcast } from './services/bus';
import { streamHeaders } from './services/stream';
import { exit as exitGaming, restoreAfterCrash } from './services/gaming';
import { startBattery } from './services/battery';

const isDev = !app.isPackaged;
const args = process.argv;
const tvMode = args.includes('--tv-mode');
const SHOT = process.env.SMARTTV_SHOT || ''; // test harness: capture a screenshot and quit
const SHOT_SCRIPT = process.env.SMARTTV_SCRIPT || '';

// Hardware video decoding + codec/feature flags must be set before the app is ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,MediaFoundationD3D11VideoCapture');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // keeps rendering smooth when other windows overlap

protocol.registerSchemesAsPrivileged([
  { scheme: 'tvmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

let win: BrowserWindow | null = null;
let desktopMode = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
}

function inLibrary(p: string): boolean {
  const n = path.normalize(p).toLowerCase();
  if (n.startsWith(path.join(app.getPath('userData'), 'wallpapers').toLowerCase() + path.sep)) return true;
  if (allowedFiles.has(n)) return true;
  return all<any>('SELECT path FROM folders').some((f) => n.startsWith(path.normalize(f.path).toLowerCase() + path.sep) || n === path.normalize(f.path).toLowerCase());
}

function installNetworkHooks() {
  const ses = session.defaultSession;
  // Local media: tvmedia://local/<encoded absolute path>
  protocol.handle('tvmedia', async (req) => {
    try {
      const u = new URL(req.url);
      const p = decodeURIComponent(u.pathname.slice(1));
      if (!inLibrary(p)) return new Response('Forbidden', { status: 403 });
      return await net.fetch(pathToFileURL(p).toString(), { headers: req.headers });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });

  // IPTV/HLS servers rarely send CORS headers; allow the player to read third-party media responses.
  ses.webRequest.onHeadersReceived((details, cb) => {
    const h = details.responseHeaders || {};
    const fromApp = details.referrer?.startsWith('file://') || details.referrer?.startsWith('http://localhost:5173') || !details.referrer;
    if (fromApp && /^https?:/i.test(details.url) && ['xhr', 'media', 'other', 'image'].includes(details.resourceType)) {
      for (const k of Object.keys(h)) if (/^access-control-allow-(origin|headers|methods)$/i.test(k)) delete h[k];
      h['Access-Control-Allow-Origin'] = ['*'];
      h['Access-Control-Allow-Headers'] = ['*'];
      h['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
      if (details.method === 'OPTIONS') return cb({ responseHeaders: h, statusLine: 'HTTP/1.1 200 OK' });
    }
    cb({ responseHeaders: h });
  });

  // Some playlists require a specific User-Agent/Referer (EXTVLCOPT lines) — apply them per channel host.
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const rh = details.requestHeaders;
    if (['xhr', 'media', 'other'].includes(details.resourceType) && /^https?:/i.test(details.url) && !/localhost|127\.0\.0\.1/.test(details.url)) {
      if (streamHeaders.ua) rh['User-Agent'] = streamHeaders.ua;
      if (streamHeaders.referrer) { rh['Referer'] = streamHeaders.referrer; try { rh['Origin'] = new URL(streamHeaders.referrer).origin; } catch { /* ignore */ } }
    }
    cb({ requestHeaders: rh });
  });

  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
}


function createWindow() {
  const s = loadSettings();
  const d = getTargetDisplay();
  win = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    fullscreen: false, frame: false, show: false, backgroundColor: '#05060d', title: 'MY SMART TV', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, spellcheck: false, autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.once('ready-to-show', () => {
    if (!win) return;
    win.show();
    if (s.startupFullscreen && !SHOT) setTimeout(() => win && placeWindow(win, true), 50);
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://') && !url.startsWith('http://localhost:5173')) e.preventDefault(); });
  win.webContents.on('render-process-gone', (_e, d2) => { log.error('Renderer gone', d2); win?.reload(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' && (isDev || args.includes('--devtools'))) win?.webContents.toggleDevTools();
    if (input.key === 'F11') { win?.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.on('closed', () => { win = null; });

  if (process.env.SMARTTV_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  if (SHOT) {
    win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await wait(1800);
      try {
        for (const step of SHOT_SCRIPT.split('|||').filter(Boolean)) {
          if (step.startsWith('wait:')) { await wait(parseInt(step.slice(5), 10)); continue; }
          if (step.startsWith('shot:')) {
            const img = await win!.webContents.capturePage();
            fs.writeFileSync(step.slice(5), img.toPNG());
            continue;
          }
          const r = await win!.webContents.executeJavaScript(step, true);
          if (r !== undefined) console.log('SCRIPT_RESULT', JSON.stringify(r));
        }
        if (SHOT !== '1') { const img = await win!.webContents.capturePage(); fs.writeFileSync(SHOT, img.toPNG()); }
      } catch (e: any) { console.log('SHOT_ERROR', e?.message); }
      app.quit();
    });
  }
}

function applyDisplay() {
  if (!win) return;
  placeWindow(win, !desktopMode);
  broadcast('display:changed', {});
}

function setDesktopMode(on: boolean) {
  desktopMode = on;
  if (!win) return;
  if (on) { win.setFullScreen(false); win.setBounds({ ...getTargetDisplay().workArea }); win.minimize(); }
  else { win.restore(); placeWindow(win, true); }
  broadcast('tv:desktop-mode', { on });
}

// The database is opened before "ready" so the hardware-acceleration preference can be applied.
applyPendingRestore();
initDb();
if (!loadSettings().hwAccel) app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  log.info(`Starting MY SMART TV ${app.getVersion()} (tvMode=${tvMode}, packaged=${app.isPackaged}, electron ${process.versions.electron})`);
  void restoreAfterCrash();
  startBattery();
  installNetworkHooks();
  registerIpc({ applyDisplay, setDesktopMode });
  createWindow();

  // Return-to-TV shortcuts that work while another app/browser has focus.
  for (const acc of ['CommandOrControl+Alt+H', 'BrowserHome', 'Alt+Home']) {
    try { globalShortcut.register(acc, () => bringTvToFront('shortcut')); } catch { /* may be taken */ }
  }

  // HDMI hot-plug handling
  screen.on('display-added', () => { log.info('Display added'); setTimeout(applyDisplay, 800); });
  screen.on('display-removed', () => { log.info('Display removed'); setTimeout(applyDisplay, 800); });
  // resolution / scaling / refresh changes: refit the window to the TV so nothing is cropped or letterboxed
  let metricsTimer: NodeJS.Timeout | undefined;
  screen.on('display-metrics-changed', () => { broadcast('display:changed', {}); clearTimeout(metricsTimer); metricsTimer = setTimeout(() => { if (win && !desktopMode && win.isFullScreen()) applyDisplay(); }, 700); });

  // keep playlists fresh in the background
  if (!SHOT) {
    setTimeout(() => refreshAll(true).catch((e) => log.warn('Auto refresh failed', e)), 20_000);
    setInterval(() => refreshAll(true).catch(() => undefined), 3 * 3600_000);
  }
});

app.on('window-all-closed', () => { app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); void exitGaming(); closeDb(); });
process.on('uncaughtException', (e) => log.error('uncaughtException', e));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e as any));
