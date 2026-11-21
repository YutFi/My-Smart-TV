import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let file = '';

export function logFile() {
  if (!file) {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'mysmarttv.log');
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 2_000_000) fs.renameSync(file, file + '.old');
    } catch { /* ignore */ }
  }
  return file;
}

function write(level: string, msg: string, extra?: unknown) {
  const line = `${new Date().toISOString()} [${level}] ${msg}${extra ? ' ' + safe(extra) : ''}\n`;
  try { fs.appendFileSync(logFile(), line); } catch { /* ignore */ }
  if (!app.isPackaged) console.log(line.trim());
}
function safe(x: unknown) {
  if (x instanceof Error) return x.stack || x.message;
  try { return typeof x === 'string' ? x : JSON.stringify(x); } catch { return String(x); }
}

export const log = {
  info: (m: string, e?: unknown) => write('INFO', m, e),
  warn: (m: string, e?: unknown) => write('WARN', m, e),
  error: (m: string, e?: unknown) => write('ERROR', m, e),
  tail(lines = 200): string {
    try {
      const t = fs.readFileSync(logFile(), 'utf8').split('\n');
      return t.slice(-lines).join('\n');
    } catch { return ''; }
  },
};
