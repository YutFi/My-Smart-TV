import { api, type BatteryInfo } from './api';
import { createStore, useStore } from './store';
import { toast } from './app';

export const batteryStore = createStore<BatteryInfo>({ present: false, percent: 0, charging: false, pluggedIn: true, minutes: -1 });
export const useBattery = () => useStore(batteryStore);

let warned = 100;

function apply(b: BatteryInfo) {
  batteryStore.set(b);
  if (!b.present) return;
  // low-battery warnings (once per threshold, re-armed when charging or recovered)
  if (b.charging || b.pluggedIn || b.percent > 25) { warned = 100; return; }
  if (b.percent <= 10 && warned > 10) { warned = 10; toast(`Battery very low: ${b.percent}% — plug in your charger now`, 'error', 9000); }
  else if (b.percent <= 20 && warned > 20) { warned = 20; toast(`Battery low: ${b.percent}% — plug in your charger soon`, 'error', 7000); }
}

export function initBattery() {
  api.system.battery().then(apply).catch(() => undefined);
  api.on('tv:battery', apply);
}

export const fmtLeft = (min: number) => (min > 0 ? `${Math.floor(min / 60) ? Math.floor(min / 60) + 'h ' : ''}${min % 60}m left` : '');
