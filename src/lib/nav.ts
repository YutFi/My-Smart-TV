// Spatial (D-pad) navigation engine for remote controls, air mice, keyboards and game controllers.
import { useEffect, useRef } from 'react';

export type TvKey =
  | 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'backspace' | 'space' | 'playpause' | 'play' | 'pause' | 'stop'
  | 'next' | 'prev' | 'ff' | 'rw' | 'volup' | 'voldown' | 'mute' | 'pgup' | 'pgdn' | 'home' | 'menu' | 'char';

export interface KeyEv { k: TvKey; ch: string; ev: KeyboardEvent | null; repeat: boolean }
export type KeyHandler = (e: KeyEv) => boolean | void;

const handlers: { fn: () => KeyHandler }[] = [];
const elementKeyHandlers = new WeakMap<HTMLElement, (e: KeyEv) => boolean | void>();
const scopes: { el: HTMLElement; prev: HTMLElement | null }[] = [];
let restoreKey = '';
let restoreUntil = 0;
let lastUserInput = Date.now();
const activityListeners = new Set<() => void>();
export type InputMode = 'keys' | 'pointer';
let inputMode: InputMode = 'keys';

export const onActivity = (fn: () => void) => { activityListeners.add(fn); return () => { activityListeners.delete(fn); }; };
export const idleMs = () => Date.now() - lastUserInput;
export const getInputMode = () => inputMode;

function markActive() {
  lastUserInput = Date.now();
  activityListeners.forEach((f) => f());
}

export function normalize(e: KeyboardEvent): { k: TvKey; ch: string } | null {
  const key = e.key;
  switch (key) {
    case 'ArrowUp': return { k: 'up', ch: '' };
    case 'ArrowDown': return { k: 'down', ch: '' };
    case 'ArrowLeft': return { k: 'left', ch: '' };
    case 'ArrowRight': return { k: 'right', ch: '' };
    case 'Enter': return { k: 'select', ch: '' };
    case 'Escape': case 'BrowserBack': case 'GoBack': return { k: 'back', ch: '' };
    case 'Backspace': return { k: 'backspace', ch: '' };
    case ' ': return { k: 'space', ch: ' ' };
    case 'MediaPlayPause': return { k: 'playpause', ch: '' };
    case 'MediaPlay': return { k: 'play', ch: '' };
    case 'MediaPause': return { k: 'pause', ch: '' };
    case 'MediaStop': return { k: 'stop', ch: '' };
    case 'MediaTrackNext': return { k: 'next', ch: '' };
    case 'MediaTrackPrevious': return { k: 'prev', ch: '' };
    case 'MediaFastForward': return { k: 'ff', ch: '' };
    case 'MediaRewind': return { k: 'rw', ch: '' };
    case 'AudioVolumeUp': return { k: 'volup', ch: '' };
    case 'AudioVolumeDown': return { k: 'voldown', ch: '' };
    case 'AudioVolumeMute': return { k: 'mute', ch: '' };
    case 'PageUp': case 'ChannelUp': return { k: 'pgup', ch: '' };
    case 'PageDown': case 'ChannelDown': return { k: 'pgdn', ch: '' };
    case 'Home': case 'BrowserHome': return { k: 'home', ch: '' };
    case 'ContextMenu': case 'F1': case 'Tab': return { k: 'menu', ch: '' };
    default:
      if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) return { k: 'char', ch: key };
      return null;
  }
}

// ---- key handler stack (top-most gets the first chance) ----
export function useKeys(handler: KeyHandler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const entry = { fn: () => ref.current };
    handlers.push(entry);
    return () => { const i = handlers.indexOf(entry); if (i >= 0) handlers.splice(i, 1); };
  }, [enabled]);
}

let defaultBack: (() => boolean) | null = null;
export const setDefaultBack = (fn: (() => boolean) | null) => { defaultBack = fn; };
let defaultHome: (() => void) | null = null;
export const setDefaultHome = (fn: (() => void) | null) => { defaultHome = fn; };

export function dispatchKey(k: TvKey, ch = '', ev: KeyboardEvent | null = null, repeat = false): boolean {
  markActive();
  const e: KeyEv = { k, ch, ev, repeat };
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i].fn()(e)) return true;
  }
  const cur = document.activeElement as HTMLElement | null;
  if (cur) {
    const h = elementKeyHandlers.get(cur);
    if (h && h(e)) return true;
  }
  switch (k) {
    case 'up': case 'down': case 'left': case 'right': move(k); return true;
    case 'select': case 'space': {
      if (cur && cur.hasAttribute('data-f') && !cur.hasAttribute('data-disabled')) { cur.click(); return true; }
      return false;
    }
    case 'back': case 'backspace': return defaultBack ? defaultBack() : false;
    case 'home': defaultHome?.(); return true;
    case 'pgdn': page(1); return true;
    case 'pgup': page(-1); return true;
    default: return false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented && e.key !== 'Escape') return;
  const n = normalize(e);
  if (!n) return;
  if (inputMode !== 'keys') { inputMode = 'keys'; document.documentElement.dataset.input = 'keys'; }
  const consumed = dispatchKey(n.k, n.ch, e, e.repeat);
  if (consumed || ['up', 'down', 'left', 'right', 'space', 'pgup', 'pgdn'].includes(n.k)) e.preventDefault();
}

// ---- scopes (modals / overlays trap focus) ----
export function pushScope(el: HTMLElement) {
  scopes.push({ el, prev: document.activeElement as HTMLElement | null });
  requestAnimationFrame(() => focusFirst(el));
}
export function popScope(el: HTMLElement) {
  const i = scopes.findIndex((s) => s.el === el);
  if (i < 0) return;
  const [s] = scopes.splice(i, 1);
  requestAnimationFrame(() => { if (s.prev && s.prev.isConnected) focusEl(s.prev); });
}
export const activeRoot = (): HTMLElement => scopes[scopes.length - 1]?.el || (document.getElementById('root') as HTMLElement);

// ---- geometry ----
const isVisible = (el: HTMLElement) => {
  if (el.hasAttribute('data-disabled')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none';
};

export function focusables(root: HTMLElement = activeRoot()): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-f]')).filter(isVisible);
}

export function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true });
  ensureVisible(el);
}

export function focusFirst(root: HTMLElement = activeRoot()): boolean {
  const list = focusables(root);
  if (!list.length) return false;
  const auto = list.find((e) => e.hasAttribute('data-autofocus'));
  let target = auto;
  if (!target) {
    // prefer the first element in the page content, otherwise the first one
    target = list.find((e) => e.closest('[data-page]')) || list[0];
  }
  focusEl(target);
  return true;
}

function ensureVisible(el: HTMLElement) {
  const h = el.closest<HTMLElement>('[data-hscroll]');
  if (h) {
    const r = el.getBoundingClientRect(); const c = h.getBoundingClientRect();
    const margin = c.width * 0.12;
    if (r.left < c.left + margin || r.right > c.right - margin) {
      const delta = (r.left + r.width / 2) - (c.left + c.width / 2);
      h.scrollBy({ left: delta, behavior: 'smooth' });
    }
  }
  const v = el.closest<HTMLElement>('[data-vscroll]');
  if (v) {
    // use the row container (if any) so the whole row, including its title, is brought into view
    const target = (el.closest('[data-row]') as HTMLElement) || el;
    const r = target.getBoundingClientRect(); const c = v.getBoundingClientRect();
    const top = c.top + c.height * 0.1; const bottom = c.bottom - c.height * 0.08;
    if (r.top < top || r.bottom > bottom) {
      const want = c.top + c.height * 0.22;
      v.scrollBy({ top: r.top - want, behavior: 'smooth' });
    }
  }
}

function move(dir: 'up' | 'down' | 'left' | 'right') {
  const root = activeRoot();
  let cur = document.activeElement as HTMLElement | null;
  if (!cur || cur === document.body || !root.contains(cur) || !cur.hasAttribute('data-f')) { focusFirst(root); return; }
  const cr = cur.getBoundingClientRect();
  const ccx = cr.left + cr.width / 2; const ccy = cr.top + cr.height / 2;
  let best: HTMLElement | null = null; let bestScore = Infinity;
  for (const el of focusables(root)) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    let primary: number; let center: number; let gap: number;
    const hGap = Math.max(0, Math.max(r.left, cr.left) - Math.min(r.right, cr.right)); // horizontal gap between spans (0 = overlap)
    const vGap = Math.max(0, Math.max(r.top, cr.top) - Math.min(r.bottom, cr.bottom));
    if (dir === 'right') { if (cx <= ccx + 2 || r.left < cr.left + 2) continue; primary = Math.max(0, r.left - cr.right); center = Math.abs(cy - ccy); gap = vGap; }
    else if (dir === 'left') { if (cx >= ccx - 2 || r.right > cr.right - 2) continue; primary = Math.max(0, cr.left - r.right); center = Math.abs(cy - ccy); gap = vGap; }
    else if (dir === 'down') { if (cy <= ccy + 2 || r.top < cr.top + 2) continue; primary = Math.max(0, r.top - cr.bottom); center = Math.abs(cx - ccx); gap = hGap; }
    else { if (cy >= ccy - 2 || r.bottom > cr.bottom - 2) continue; primary = Math.max(0, cr.top - r.bottom); center = Math.abs(cx - ccx); gap = hGap; }
    // prefer elements that overlap our span (gap 0), then the closest in the direction of travel, then the best-aligned
    const score = primary + gap * 4 + center * 0.06 + (gap > 0 ? 300 : 0);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focusEl(best);
  else cur.dispatchEvent(new CustomEvent('tv-edge', { bubbles: true, detail: dir }));
}

function page(dir: 1 | -1) {
  const v = document.querySelector<HTMLElement>('[data-vscroll]');
  if (!v) return;
  v.scrollBy({ top: dir * v.clientHeight * 0.8, behavior: 'smooth' });
  setTimeout(() => {
    const cur = document.activeElement as HTMLElement | null;
    const list = focusables().filter((e) => v.contains(e));
    const vr = v.getBoundingClientRect();
    const inView = list.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= vr.top && r.bottom <= vr.bottom; });
    if (inView.length && (!cur || !inView.includes(cur))) focusEl(dir > 0 ? inView[0] : inView[inView.length - 1]);
  }, 350);
}

// ---- focus recovery (focus lost when the focused element unmounts, async content arrives, etc.) ----
export function restoreFocusTo(key: string) { restoreKey = key; restoreUntil = Date.now() + 2500; }

let rafPending = false;
function recover() {
  rafPending = false;
  const root = activeRoot();
  if (restoreKey && Date.now() < restoreUntil) {
    const t = Array.from(root.querySelectorAll<HTMLElement>('[data-fk]')).find((e) => e.dataset.fk === restoreKey && isVisible(e));
    if (t) { restoreKey = ''; focusEl(t); return; }
  }
  const cur = document.activeElement as HTMLElement | null;
  const ok = cur && cur !== document.body && root.contains(cur) && cur.hasAttribute('data-f') && cur.isConnected;
  if (!ok) focusFirst(root);
}
function scheduleRecover() { if (!rafPending) { rafPending = true; requestAnimationFrame(recover); } }

// ---- pointer (air mouse): hovering focuses the item under the cursor ----
let lastPos = { x: -1, y: -1 };
let hideTimer: number | undefined;
function onPointerMove(e: PointerEvent) {
  if (Math.abs(e.clientX - lastPos.x) + Math.abs(e.clientY - lastPos.y) < 4) return;
  lastPos = { x: e.clientX, y: e.clientY };
  markActive();
  if (inputMode !== 'pointer') { inputMode = 'pointer'; document.documentElement.dataset.input = 'pointer'; }
  document.documentElement.classList.remove('hide-cursor');
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => document.documentElement.classList.add('hide-cursor'), 3500);
  const t = (e.target as HTMLElement | null)?.closest?.('[data-f]') as HTMLElement | null;
  if (t && t !== document.activeElement && activeRoot().contains(t) && isVisible(t)) t.focus({ preventScroll: true });
}

// ---- game controller ----
const padState = { held: new Map<string, number>() };
function pollPads() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[] : [];
  const now = performance.now();
  for (const p of pads) {
    const press = (id: string, down: boolean, k: TvKey) => {
      const key = `${p.index}:${id}`;
      if (!down) { padState.held.delete(key); return; }
      const t = padState.held.get(key);
      if (t === undefined) { padState.held.set(key, now + 420); dispatchKey(k); }
      else if (now >= t && ['up', 'down', 'left', 'right', 'ff', 'rw', 'volup', 'voldown'].includes(k)) { padState.held.set(key, now + 110); dispatchKey(k, '', null, true); }
    };
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const ax = p.axes[0] || 0; const ay = p.axes[1] || 0;
    press('up', b(12) || ay < -0.6, 'up'); press('down', b(13) || ay > 0.6, 'down');
    press('left', b(14) || ax < -0.6, 'left'); press('right', b(15) || ax > 0.6, 'right');
    press('a', b(0), 'select'); press('b', b(1), 'back'); press('x', b(2), 'playpause'); press('y', b(3), 'menu');
    press('lb', b(4), 'prev'); press('rb', b(5), 'next'); press('lt', b(6), 'rw'); press('rt', b(7), 'ff');
    press('start', b(9), 'home'); press('sel', b(8), 'menu');
  }
  requestAnimationFrame(pollPads);
}

export function initNav() {
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', markActive, { passive: true });
  // Phone remotes / air mice: right-click (or the mouse "back" button) acts as Back
  window.addEventListener('contextmenu', (e) => { e.preventDefault(); dispatchKey('back'); });
  window.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); dispatchKey('back'); } });
  window.addEventListener('wheel', markActive, { passive: true });
  new MutationObserver(scheduleRecover).observe(document.getElementById('root')!, { childList: true, subtree: true });
  window.addEventListener('gamepadconnected', () => { document.documentElement.dataset.pad = '1'; });
  requestAnimationFrame(pollPads);
  document.documentElement.dataset.input = 'keys';
  document.addEventListener('focusin', (e) => { const t = e.target as HTMLElement; if (t.hasAttribute?.('data-f')) ensureVisible(t); });
}

// Per-element key hook (used by sliders, carousels, etc.)
export function registerElementKeys(el: HTMLElement | null, fn: ((e: KeyEv) => boolean | void) | null) {
  if (!el) return;
  if (fn) elementKeyHandlers.set(el, fn); else elementKeyHandlers.delete(el);
}
