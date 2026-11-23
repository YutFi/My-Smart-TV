import { execFile } from 'node:child_process';
import { shell } from 'electron';
import { log } from './log';

export interface InstalledApp { name: string; appId: string }
export interface DiscoveredApp extends InstalledApp { builtin?: string }

function ps(cmd: string): Promise<string> {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 20000, maxBuffer: 8_000_000 }, (err, out) => resolve(err ? '' : String(out))));
}

// Every app Windows lists in the Start menu (Microsoft Store apps and classic programs alike).
export async function listInstalledApps(): Promise<InstalledApp[]> {
  const out = await ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress');
  try {
    const j = JSON.parse(out.trim()); const arr = Array.isArray(j) ? j : [j];
    return arr.filter((a: any) => a?.Name && a?.AppID && !/mysmarttv|my smart tv/i.test(a.Name + a.AppID)).map((a: any) => ({ name: String(a.Name), appId: String(a.AppID) })).sort((x: InstalledApp, y: InstalledApp) => x.name.localeCompare(y.name));
  } catch { return []; }
}

// Entertainment / streaming apps recognised automatically. `builtin` maps an app to one of MY SMART TV's own tiles so that
// tile opens the installed Windows app instead of the website.
const PATTERNS: { re: RegExp; builtin?: string }[] = [
  { re: /netflix/i, builtin: 'netflix' }, { re: /disney\s?\+|disney plus/i, builtin: 'disney' }, { re: /prime video|amazon prime/i, builtin: 'prime' },
  { re: /^apple tv/i, builtin: 'appletv' }, { re: /^max$|hbo max/i, builtin: 'max' }, { re: /iqiyi|iq\.com/i, builtin: 'iqiyi' }, { re: /^viu\b/i, builtin: 'viu' },
  { re: /wetv/i, builtin: 'wetv' }, { re: /crunchyroll/i, builtin: 'crunchyroll' }, { re: /spotify/i, builtin: 'spotify' }, { re: /youtube/i, builtin: 'youtube' },
  { re: /^twitch/i, builtin: 'twitch' }, { re: /hotstar/i, builtin: 'hotstar' }, { re: /sooka|astro go/i, builtin: 'mytv' },
  { re: /\bplex\b/i }, { re: /\bkodi\b/i }, { re: /vlc media player/i }, { re: /jellyfin/i }, { re: /\bemby\b/i }, { re: /stremio/i }, { re: /\btubi\b/i }, { re: /\bhulu\b/i },
  { re: /peacock/i }, { re: /paramount/i }, { re: /discovery\+|discovery plus/i }, { re: /bilibili/i }, { re: /mubi/i }, { re: /funimation/i }, { re: /^movies & tv$/i },
  { re: /tving|jiocinema|zee5|sonyliv|catchplay|vidio|hbo go|rakuten viki|\bviki\b|dazn|espn|fubo|pluto tv|crackle|apple music|tidal|deezer|amazon music|soundcloud/i },
];

export async function discoverMediaApps(): Promise<DiscoveredApp[]> {
  const apps = await listInstalledApps();
  const out: DiscoveredApp[] = [];
  for (const a of apps) {
    const m = PATTERNS.find((p) => p.re.test(a.name));
    if (m) out.push({ ...a, builtin: m.builtin });
  }
  return out;
}

const SAFE_ID = /^[\w.!{}\-\\ :()[\]/&+,]+$/;

// Starts any Start-menu app (UWP or classic) through the shell, exactly like clicking it in the Start menu.
export function launchShellApp(appId: string): { ok: boolean; error?: string } {
  if (!SAFE_ID.test(appId) || appId.includes('"')) return { ok: false, error: 'That app address is not valid.' };
  try {
    execFile('explorer.exe', [`shell:AppsFolder\\${appId}`], { windowsHide: true }, () => undefined);
    log.info(`Launched Start-menu app ${appId}`);
    return { ok: true };
  } catch (e: any) { return { ok: false, error: e?.message || 'Could not start the app.' }; }
}

export function openStore(query?: string) {
  const uri = query ? `ms-windows-store://search/?query=${encodeURIComponent(query)}` : 'ms-windows-store://home';
  shell.openExternal(uri).catch(() => undefined);
  // the Store opens in its own window on top of the TV screen — nothing else needs to change
  return { ok: true };
}

