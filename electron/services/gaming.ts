import { app, BrowserWindow, powerSaveBlocker } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings } from '../db';
import { log } from './log';
import { broadcast } from './bus';

// "Gaming mode": while Nebula (or a Windows app/game you launched from MY SMART TV) is running, give it the machine.
// Everything here is reversible and is undone when you return to MY SMART TV:
//   * switches Windows to the built-in High performance power plan (if the PC has it) and restores your previous plan
//   * keeps the display awake
//   * lowers MY SMART TV's own CPU priority and stops its animated UI from rendering in the background
//   * pauses MY SMART TV's background playlist refresh
// It does not touch security settings, drivers, game files or controller behaviour.

const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
let active = false;
let prevScheme = '';
let changedPlan = false;
let blockerId: number | null = null;

export const isGaming = () => active;
const restoreFile = () => path.join(app.getPath('userData'), 'gaming-restore.json');

function powercfg(args: string[]): Promise<string> {
  return new Promise((resolve) => execFile('powercfg', args, { windowsHide: true, timeout: 8000 }, (err, out) => resolve(err ? '' : String(out))));
}

function setPriority(level: number) {
  try { for (const m of app.getAppMetrics()) { try { os.setPriority(m.pid, level); } catch { /* process gone or protected */ } } } catch { /* ignore */ }
}

function setThrottling(on: boolean) {
  for (const w of BrowserWindow.getAllWindows()) { if (!w.isDestroyed()) { try { w.webContents.setBackgroundThrottling(on); } catch { /* ignore */ } } }
}

export async function enter(label = ''): Promise<boolean> {
  if (active || !loadSettings().gamingMode) return false;
  active = true;
  const cur = await powercfg(['/getactivescheme']);
  prevScheme = /([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i.exec(cur)?.[1] || '';
  const list = await powercfg(['/list']);
  if (prevScheme && prevScheme.toLowerCase() !== HIGH_PERF && list.toLowerCase().includes(HIGH_PERF)) {
    try { fs.writeFileSync(restoreFile(), JSON.stringify({ scheme: prevScheme })); } catch { /* ignore */ }
    await powercfg(['/setactive', HIGH_PERF]);
    changedPlan = true;
  }
  blockerId = powerSaveBlocker.start('prevent-display-sleep');
  setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
  setThrottling(true);
  broadcast('tv:gaming', { on: true, label });
  log.info(`Gaming mode on${label ? ' for ' + label : ''} (power plan ${changedPlan ? 'switched to High performance' : 'unchanged'})`);
  return true;
}

export async function exit() {
  if (!active) return;
  active = false;
  if (changedPlan && prevScheme) { await powercfg(['/setactive', prevScheme]); try { fs.unlinkSync(restoreFile()); } catch { /* ignore */ } }
  changedPlan = false; prevScheme = '';
  if (blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
  setPriority(os.constants.priority.PRIORITY_NORMAL);
  setThrottling(false);
  broadcast('tv:gaming', { on: false });
  log.info('Gaming mode off');
}

// If the app was closed or crashed during a gaming session, put the user's power plan back on next start.
export async function restoreAfterCrash() {
  try {
    const f = restoreFile();
    if (!fs.existsSync(f)) return;
    const { scheme } = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (/^[0-9a-f-]{36}$/i.test(scheme)) await powercfg(['/setactive', scheme]);
    fs.unlinkSync(f);
    log.info('Restored power plan after an interrupted gaming session');
  } catch { /* ignore */ }
}
