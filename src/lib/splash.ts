import { appStore } from './app';
import { createStore } from './store';
import { play } from './sfx';

export interface SplashInfo { title: string; text?: string; color: string; color2: string; gaming?: boolean; sub?: string }

export const SPLASH_MS = 2300;
export const splashStore = createStore<{ info: SplashInfo | null; token: number }>({ info: null, token: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const cancelSplash = () => splashStore.set({ info: null, token: 0 });

// Plays the launch splash (animation + sound), then runs the real launch. The user can cancel with Back during the splash.
export async function launchWithSplash(info: SplashInfo, action: () => Promise<{ ok: boolean; error?: string }>): Promise<{ ok: boolean; error?: string }> {
  if (!appStore.get().settings.launchSplash) return action();
  const token = Date.now();
  splashStore.set({ info, token });
  play('launch');
  await sleep(SPLASH_MS);
  if (splashStore.get().token !== token) return { ok: false, error: 'cancelled' };
  const r = await action();
  if (!r.ok) { cancelSplash(); play('error'); return r; }
  play('launchDone');
  setTimeout(() => { if (splashStore.get().token === token) cancelSplash(); }, 4200); // stays up until the app's window covers the screen
  return r;
}
