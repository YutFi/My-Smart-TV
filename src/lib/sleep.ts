import { createStore } from './store';
import { api } from './api';
import { appStore, stopPlayer, toast } from './app';

export const sleepStore = createStore<{ endsAt: number }>({ endsAt: 0 });
let timer: number | undefined;

export function setSleepTimer(minutes: number) {
  clearTimeout(timer);
  if (!minutes) { sleepStore.set({ endsAt: 0 }); toast('Sleep timer off', 'info', 2000); return; }
  const endsAt = Date.now() + minutes * 60000;
  sleepStore.set({ endsAt });
  toast(`Sleep timer: ${minutes} minutes`, 'ok', 2500);
  timer = window.setTimeout(async () => {
    sleepStore.set({ endsAt: 0 });
    stopPlayer();
    document.querySelectorAll<HTMLVideoElement>('video,audio').forEach((v) => v.pause());
    toast('Sleep timer finished — playback stopped', 'info', 6000);
    if (appStore.get().settings.sleepAction === 'sleep-pc') { await new Promise((r) => setTimeout(r, 3000)); api.system.sleepPc(); }
  }, minutes * 60000);
}
