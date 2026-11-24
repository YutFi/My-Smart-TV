import { idleMs } from './nav';

// UI sound effects, synthesized with the Web Audio API (no audio files to ship). Everything goes through a smooth signal chain:
//   voices -> dry bus ----------------------> compressor -> master gain -> output device
//          -> reverb send (soft room tail) -> /
// Three sound packs change the character: Soft (warm sine/triangle + reverb), Glass (bell-like shimmer) and Retro (chip square).
export type Sfx =
  | 'hover' | 'select' | 'back' | 'open' | 'close' | 'tab' | 'on' | 'off' | 'tick' | 'type' | 'delete'
  | 'notify' | 'success' | 'error' | 'launch' | 'launchDone' | 'startup' | 'wake' | 'swell';
export type SoundPack = 'soft' | 'glass' | 'retro';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let dry: GainNode | null = null;
let send: GainNode | null = null;
let noise: AudioBuffer | null = null;
let cfg: { enabled: boolean; volume: number; sink: string; pack: SoundPack } = { enabled: true, volume: 0.6, sink: '', pack: 'soft' };
let lastHover = 0; let lastTick = 0;

const PACK = {
  soft: { type: 'sine' as OscillatorType, accent: 'triangle' as OscillatorType, reverb: 0.26, lp: 6500, bell: false },
  glass: { type: 'sine' as OscillatorType, accent: 'sine' as OscillatorType, reverb: 0.34, lp: 9000, bell: true },
  retro: { type: 'square' as OscillatorType, accent: 'square' as OscillatorType, reverb: 0, lp: 3800, bell: false },
};

function applySink() {
  if (ctx && (ctx as any).setSinkId) (ctx as any).setSinkId(cfg.sink || '').catch(() => undefined);
}

// a synthetic room: 1.8 s of exponentially fading noise
function makeImpulse(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.8); const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  return buf;
}

function ensure(): AudioContext | null {
  if (!cfg.enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = cfg.volume;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      dry = ctx.createGain(); send = ctx.createGain(); send.gain.value = 1;
      const rev = ctx.createConvolver(); rev.buffer = makeImpulse(ctx);
      const wet = ctx.createGain(); wet.gain.value = PACK[cfg.pack].reverb;
      (ctx as any).__wet = wet;
      dry.connect(comp); send.connect(rev); rev.connect(wet); wet.connect(comp);
      comp.connect(master); master.connect(ctx.destination);
      applySink();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

export function configureSfx(c: { enabled: boolean; volume: number; sink: string; pack?: SoundPack }) {
  const sinkChanged = c.sink !== cfg.sink;
  cfg = { enabled: c.enabled, volume: c.volume, sink: c.sink, pack: c.pack || cfg.pack };
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(cfg.volume, ctx.currentTime + 0.08); // no clicks when the volume changes
    const wet = (ctx as any).__wet as GainNode | undefined; if (wet) wet.gain.value = PACK[cfg.pack].reverb;
  }
  if (sinkChanged) applySink();
}

interface VoiceOpts { dur: number; gain: number; delay?: number; attack?: number; slideTo?: number; wet?: number; accent?: boolean }

// one pitched voice: oscillator (+ bell partials in the Glass pack) -> low-pass -> dry + reverb send
function voice(freq: number, o: VoiceOpts) {
  const c = ensure(); if (!c || !dry || !send) return;
  const p = PACK[cfg.pack]; const t = c.currentTime + (o.delay || 0); const atk = o.attack ?? 0.012;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.lp; lp.Q.value = 0.5;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(o.gain, t + atk); env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  lp.connect(env); env.connect(dry);
  if (p.reverb > 0 && (o.wet ?? 1) > 0) { const s = c.createGain(); s.gain.value = o.wet ?? 1; env.connect(s); s.connect(send); }
  const partials: [number, number][] = p.bell ? [[1, 1], [2.76, 0.35], [5.4, 0.16]] : [[1, 1]];
  for (const [mult, g] of partials) {
    const osc = c.createOscillator(); const og = c.createGain();
    osc.type = o.accent ? p.accent : p.type; osc.frequency.setValueAtTime(freq * mult, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo * mult, t + o.dur);
    og.gain.value = g; osc.connect(og); og.connect(lp);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
}

function whoosh(dur: number, f0: number, f1: number, gain: number, delay = 0) {
  const c = ensure(); if (!c || !dry || !send) return;
  if (!noise) { noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = c.currentTime + delay;
  const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(dry);
  if (PACK[cfg.pack].reverb > 0) { const s = c.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(send); }
  src.start(t); src.stop(t + dur + 0.05);
}

// pentatonic ladder: moving across the screen plays a rising/falling melody instead of the same blip
const LADDER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

export function play(name: Sfx, opts: { x?: number } = {}) {
  if (!cfg.enabled) return;
  const retro = cfg.pack === 'retro';
  switch (name) {
    case 'hover': {
      const now = performance.now(); if (now - lastHover < 60) return; lastHover = now;
      const idx = Math.max(0, Math.min(LADDER.length - 1, Math.floor((opts.x ?? 0.5) * LADDER.length)));
      voice(LADDER[idx], { dur: retro ? 0.05 : 0.16, gain: retro ? 0.03 : 0.045, wet: 0.7 }); break;
    }
    case 'select': voice(660, { dur: 0.16, gain: 0.09, slideTo: 990 }); voice(1320, { dur: 0.12, gain: 0.04, delay: 0.015, accent: true }); break;
    case 'back': voice(620, { dur: 0.14, gain: 0.08, slideTo: 380 }); break;
    case 'open': whoosh(0.26, 380, 2600, 0.05); voice(880, { dur: 0.2, gain: 0.04, delay: 0.1, slideTo: 1175 }); break;
    case 'close': whoosh(0.2, 2400, 400, 0.04); break;
    case 'tab': whoosh(0.18, 500, 3200, 0.045); voice(784, { dur: 0.2, gain: 0.05, delay: 0.04 }); break;
    case 'on': voice(660, { dur: 0.13, gain: 0.08 }); voice(990, { dur: 0.16, gain: 0.08, delay: 0.07 }); break;
    case 'off': voice(990, { dur: 0.13, gain: 0.08 }); voice(660, { dur: 0.16, gain: 0.08, delay: 0.07 }); break;
    case 'tick': { const now = performance.now(); if (now - lastTick < 45) return; lastTick = now; voice(1500, { dur: 0.05, gain: 0.04, wet: 0.3 }); break; }
    case 'type': voice(1800 + Math.random() * 150, { dur: 0.04, gain: 0.04, wet: 0.2 }); break;
    case 'delete': voice(900, { dur: 0.06, gain: 0.04, slideTo: 600, wet: 0.2 }); break;
    case 'notify': voice(880, { dur: 0.25, gain: 0.07 }); voice(1175, { dur: 0.35, gain: 0.07, delay: 0.1 }); break;
    case 'success': [659, 784, 1047].forEach((f, i) => voice(f, { dur: 0.4, gain: 0.07, delay: i * 0.08 })); break;
    case 'error': voice(300, { dur: 0.16, gain: 0.07, slideTo: 230, accent: true }); voice(300, { dur: 0.22, gain: 0.07, slideTo: 200, delay: 0.17, accent: true }); break;
    case 'wake': voice(500, { dur: 0.22, gain: 0.06, slideTo: 900 }); break;
    case 'swell': [262, 330, 392].forEach((f, i) => voice(f, { dur: 1.6, gain: 0.04, delay: i * 0.12, attack: 0.5 })); break;
    case 'launch':
      whoosh(1.2, 180, 5200, 0.16);
      voice(110, { dur: 1.3, gain: 0.05, slideTo: 330, attack: 0.5, accent: true });
      [220, 277, 330].forEach((f, i) => voice(f, { dur: 1.2, gain: 0.045, delay: i * 0.05, attack: 0.4, slideTo: f * 1.5 }));
      break;
    case 'launchDone':
      [523, 659, 784, 1047].forEach((f, i) => voice(f, { dur: 0.9, gain: 0.07, delay: i * 0.07 }));
      break;
    case 'startup':
      [262, 330, 392, 523].forEach((f, i) => voice(f, { dur: 1.7, gain: 0.05, delay: i * 0.04, attack: 0.5, accent: true }));
      [1047, 1319, 1568].forEach((f, i) => voice(f, { dur: 0.7, gain: 0.035, delay: 0.7 + i * 0.09 }));
      break;
  }
}

// Global UI sounds: moving focus (keyboard, remote, mouse), selecting, going back.
export function initSfx() {
  (window as any).__sfx = { state: () => ctx?.state || 'none', gain: () => master?.gain.value ?? -1, pack: () => cfg.pack }; // diagnostics
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.hasAttribute?.('data-f') && !t.hasAttribute('data-silent') && idleMs() < 700) {
      const r = t.getBoundingClientRect();
      play('hover', { x: (r.left + r.width / 2) / window.innerWidth });
    }
  }, true);
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-f]') as HTMLElement | null;
    if (t && !t.hasAttribute('data-disabled') && !t.closest('[data-silent]') && !t.hasAttribute('data-silent')) play('select');
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'BrowserBack') play('back'); }, true);
  window.addEventListener('contextmenu', (e) => { if (!(e.target as HTMLElement | null)?.closest?.('[data-tile]')) play('back'); });
}
