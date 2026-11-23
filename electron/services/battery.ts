import { execFile } from 'node:child_process';
import { powerMonitor } from 'electron';
import { broadcast } from './bus';

export interface BatteryInfo {
  present: boolean;   // false on desktops without a battery
  percent: number;    // 0..100
  charging: boolean;  // actively charging
  pluggedIn: boolean; // on AC power
  minutes: number;    // estimated minutes left on battery, -1 = unknown
}

let last: BatteryInfo = { present: false, percent: 0, charging: false, pluggedIn: true, minutes: -1 };
const listeners = new Set<(b: BatteryInfo) => void>();

export const currentBattery = () => last;
export const onBattery = (fn: (b: BatteryInfo) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

function ps(cmd: string): Promise<string> {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 12000 }, (err, out) => resolve(err ? '' : String(out))));
}

// Win32_Battery.BatteryStatus: 1 discharging, 2 AC, 3 fully charged, 4 low, 5 critical, 6 charging, 7-9 charging (high/low/critical), 11 partly charged
export async function refreshBattery(): Promise<BatteryInfo> {
  let next: BatteryInfo;
  const fake = process.env.SMARTTV_FAKE_BATTERY; // test hook: "55,charging" or "12,discharging"
  if (fake) {
    const [p, mode] = fake.split(',');
    next = { present: true, percent: Number(p) || 0, charging: mode === 'charging', pluggedIn: mode === 'charging', minutes: mode === 'charging' ? -1 : 95 };
  } else {
    const out = await ps('Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus,EstimatedRunTime | ConvertTo-Json -Compress');
    try {
      const j = JSON.parse(out.trim());
      const status = Number(j.BatteryStatus);
      const run = Number(j.EstimatedRunTime);
      const onAc = ![1, 4, 5].includes(status);
      next = {
        present: true, percent: Math.max(0, Math.min(100, Number(j.EstimatedChargeRemaining) || 0)),
        charging: [2, 6, 7, 8, 9].includes(status) && Number(j.EstimatedChargeRemaining) < 100, pluggedIn: onAc,
        minutes: !onAc && run > 0 && run < 100000 ? run : -1,
      };
    } catch { next = { present: false, percent: 0, charging: false, pluggedIn: true, minutes: -1 }; }
  }
  if (JSON.stringify(next) !== JSON.stringify(last)) { last = next; listeners.forEach((f) => f(next)); broadcast('tv:battery', next); }
  return last;
}

export function startBattery() {
  void refreshBattery();
  setInterval(() => void refreshBattery(), 30_000);
  try { powerMonitor.on('on-ac', () => void refreshBattery()); powerMonitor.on('on-battery', () => void refreshBattery()); powerMonitor.on('resume', () => void refreshBattery()); } catch { /* not available */ }
}
