import { app, screen, BrowserWindow, dialog, powerSaveBlocker, net, type Display } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { all, getDb, loadSettings, dbPath, closeDb } from '../db';
import { log } from './log';
import type { DisplayInfo } from '../../shared/types';

export function listDisplays(): DisplayInfo[] {
  const target = getTargetDisplay();
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    scaleFactor: d.scaleFactor,
    refreshRate: d.displayFrequency || 60,
    primary: d.id === primary.id,
    internal: d.internal,
    isTarget: d.id === target.id,
    colorDepth: d.colorDepth,
    hdr: ((d as any).colorSpace || '').includes('HDR') || (d as any).depthPerComponent > 8,
  }));
}

export function getTargetDisplay(): Display {
  const id = loadSettings().displayId;
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === id) || screen.getPrimaryDisplay();
}

export function placeWindow(w: BrowserWindow, fullscreen = true) {
  const d = getTargetDisplay();
  if (w.isFullScreen()) w.setFullScreen(false);
  w.setBounds(d.bounds);
  if (fullscreen) setTimeout(() => !w.isDestroyed() && w.setFullScreen(true), 80);
}

let blocker: number | null = null;
export function keepAwake(on: boolean) {
  if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
}

export function setAutoStart(on: boolean): { ok: boolean; error?: string } {
  if (!app.isPackaged) return { ok: false, error: 'Automatic startup can only be enabled in the installed app.' };
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: ['--tv-mode'] });
  return { ok: true };
}

export function getAutoStart(): boolean {
  try { return app.getLoginItemSettings({ path: process.execPath, args: ['--tv-mode'] }).openAtLogin; } catch { return false; }
}

function ps(cmd: string, timeout = 15000): Promise<string> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

export interface DriveInfo { letter: string; label: string; type: 'removable' | 'fixed' | 'network' | 'optical' | 'other'; size: number; free: number }

export async function listDrives(): Promise<DriveInfo[]> {
  const out = await ps('Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType,Size,FreeSpace | ConvertTo-Json -Compress');
  if (!out.trim()) return [];
  try {
    const j = JSON.parse(out); const arr = Array.isArray(j) ? j : [j];
    const t = (n: number): DriveInfo['type'] => (n === 2 ? 'removable' : n === 3 ? 'fixed' : n === 4 ? 'network' : n === 5 ? 'optical' : 'other');
    return arr.map((d: any) => ({ letter: d.DeviceID, label: d.VolumeName || '', type: t(d.DriveType), size: d.Size || 0, free: d.FreeSpace || 0 }));
  } catch { return []; }
}

export async function systemInfo() {
  const drives = await listDrives();
  const dataDrive = path.parse(app.getPath('userData')).root.replace(/\\$/, '');
  return {
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
    os: `${os.type()} ${os.release()}`, arch: os.arch(), memory: { total: os.totalmem(), free: os.freemem() },
    cpu: os.cpus()[0]?.model || '', gpuFeatures: app.getGPUFeatureStatus(), drives, dataDrive, dataPath: app.getPath('userData'),
    packaged: app.isPackaged, autoStart: getAutoStart(), dbBytes: safeSize(dbPath()),
  };
}

const safeSize = (p: string) => { try { return fs.statSync(p).size; } catch { return 0; } };

export async function checkInternet(): Promise<boolean> {
  if (!net.isOnline()) return false;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch('https://www.gstatic.com/generate_204', { signal: ctl.signal, method: 'GET' });
    clearTimeout(t);
    return r.status === 204 || r.ok;
  } catch { return false; }
}

export async function sleepPc() {
  execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { windowsHide: true }, () => undefined);
}

// ---------- backup / restore ----------
export async function backup(win: BrowserWindow | null): Promise<{ ok: boolean; path?: string; error?: string }> {
  const res = await dialog.showSaveDialog(win!, { title: 'Back up MY SMART TV', defaultPath: `MySmartTV-backup-${new Date().toISOString().slice(0, 10)}.mstv`, filters: [{ name: 'MY SMART TV backup', extensions: ['mstv'] }] });
  if (res.canceled || !res.filePath) return { ok: false };
  try {
    if (fs.existsSync(res.filePath)) fs.unlinkSync(res.filePath);
    getDb().exec(`VACUUM INTO '${res.filePath.replace(/'/g, "''")}'`);
    log.info('Backup written to ' + res.filePath);
    return { ok: true, path: res.filePath };
  } catch (e: any) { return { ok: false, error: e?.message }; }
}

export function pendingRestorePath() { return path.join(app.getPath('userData'), 'restore.pending'); }

export async function restore(win: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
  const res = await dialog.showOpenDialog(win!, { title: 'Restore a MY SMART TV backup', properties: ['openFile'], filters: [{ name: 'MY SMART TV backup', extensions: ['mstv'] }] });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  try {
    const head = fs.readFileSync(res.filePaths[0]).subarray(0, 15).toString('latin1');
    if (head !== 'SQLite format 3') return { ok: false, error: 'That file is not a MY SMART TV backup.' };
    fs.copyFileSync(res.filePaths[0], pendingRestorePath());
    log.info('Restore staged; relaunching');
    setTimeout(() => { app.relaunch(); closeDb(); app.exit(0); }, 400);
    return { ok: true };
  } catch (e: any) { return { ok: false, error: e?.message }; }
}

export function applyPendingRestore() {
  const p = pendingRestorePath();
  if (!fs.existsSync(p)) return;
  try {
    for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath() + ext); } catch { /* none */ } }
    fs.renameSync(p, dbPath());
    log.info('Backup restored');
  } catch (e) { log.error('Restore failed', e); }
}

export const _unused = all;
