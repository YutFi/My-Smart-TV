import { idleMs } from './nav';

// UI sound effects, synthesized with the Web Audio API (no audio files to ship). Short, soft and layered so they feel
// modern rather than annoying. Everything is routed through one master gain and the selected audio output device.
export type Sfx = 'hover' | 'select' | 'back' | 'open' | 'launch' | 'launchDone' | 'error' | 'startup' | 'wake';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let cfg = { enabled: true, volume: 0.6, sink: '' };
let lastHover = 0;

function applySink() {
  if (ctx && (ctx as any).setSinkId) (ctx as any).setSinkId(cfg.sink || '').catch(() => undefined);
}

function ensure(): AudioContext | null {
  if (!cfg.enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = cfg.volume;
      master.connect(ctx.destination);
      applySink();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

export function configureSfx(c: { enabled: boolean; volume: number; sink: string }) {
  const sinkChanged = c.sink !== cfg.sink;
  cfg = c;
  if (master) master.gain.value = c.volume;
  if (sinkChanged) applySink();
}

function tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0, attack = 0.008) {
  const c = ensure(); if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
}

function whoosh(dur: number, f0: number, f1: number, gain: number, delay = 0) {
  const c = ensure(); if (!c || !master) return;
  if (!noise) { noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = c.currentTime + delay;
  const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

export function play(name: Sfx) {
  if (!cfg.enabled) return;
  switch (name) {
    case 'hover': {
      const now = performance.now(); if (now - lastHover < 55) return; lastHover = now;
      tone(1400, 1900, 0.04, 'sine', 0.035); break;
    }
    case 'select': tone(700, 1050, 0.1, 'sine', 0.09); tone(1400, 2100, 0.06, 'triangle', 0.03, 0.012); break;
    case 'back': tone(620, 380, 0.1, 'sine', 0.08); break;
    case 'open': whoosh(0.24, 400, 2400, 0.05); break;
    case 'wake': tone(500, 900, 0.16, 'sine', 0.06); break;
    case 'error': tone(230, 190, 0.12, 'square', 0.04); tone(230, 170, 0.16, 'square', 0.04, 0.15); break;
    case 'launch':
      whoosh(1.2, 180, 5200, 0.17);
      tone(110, 330, 1.3, 'sawtooth', 0.03, 0, 0.5);
      [220, 277, 330].forEach((f, i) => tone(f, f * 1.5, 1.2, 'sine', 0.04, i * 0.05, 0.4));
      break;
    case 'launchDone':
      [523, 659, 784, 1047].forEach((f, i) => { tone(f, f, 0.8, 'sine', 0.07, i * 0.07); tone(f * 2, f * 2, 0.45, 'sine', 0.02, i * 0.07); });
      break;
    case 'startup':
      [262, 330, 392, 523].forEach((f, i) => tone(f, f, 1.6, 'triangle', 0.05, i * 0.04, 0.5));
      [1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.6, 'sine', 0.03, 0.7 + i * 0.09));
      break;
  }
}

// Global UI sounds: moving focus (keyboard, remote, mouse), selecting, going back.
export function initSfx() {
  (window as any).__sfx = { state: () => ctx?.state || 'none', gain: () => master?.gain.value ?? -1 }; // diagnostics
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.hasAttribute?.('data-f') && idleMs() < 700) play('hover');
  }, true);
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-f]');
    if (t && !t.hasAttribute('data-disabled')) play('select');
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'BrowserBack') play('back'); }, true);
  window.addEventListener('contextmenu', () => play('back'));
}
