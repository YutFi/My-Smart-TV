import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { idleMs, onActivity, useKeys } from '../lib/nav';
import { playerStore, useApp } from '../lib/app';
import { createStore, useStore } from '../lib/store';
import { fmtClock } from '../lib/format';

// ---------------------------------------------------------------------------------------------------------------------
// Ambient screensaver: animated canvas scenes (aurora, starfield, bokeh, waves) + optional artwork slideshow, with a
// softly glowing clock that drifts around the screen. Shown after inactivity when nothing is playing.
// ---------------------------------------------------------------------------------------------------------------------

const previewStore = createStore<{ on: boolean; ignoreUntil: number }>({ on: false, ignoreUntil: 0 });
export const previewScreensaver = () => previewStore.set({ on: true, ignoreUntil: Date.now() + 1800 });

type SceneName = 'aurora' | 'stars' | 'bokeh' | 'waves' | 'grid';
const SCENES: SceneName[] = ['aurora', 'grid', 'stars', 'bokeh', 'waves'];

interface Scene { draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number): void }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function makeAurora(): Scene {
  const ribbons = [
    { c: [139, 92, 246], base: 0.32, amp: 0.1, f: 1.6, sp: 0.35, ph: 0 }, { c: [59, 130, 246], base: 0.4, amp: 0.12, f: 1.2, sp: -0.28, ph: 2 },
    { c: [34, 211, 238], base: 0.5, amp: 0.09, f: 2.1, sp: 0.22, ph: 4 }, { c: [236, 72, 153], base: 0.28, amp: 0.08, f: 1.9, sp: -0.4, ph: 1 },
    { c: [99, 102, 241], base: 0.58, amp: 0.1, f: 1.4, sp: 0.3, ph: 3 },
  ];
  const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 0.75, r: rnd(0.4, 1.5), p: rnd(0, 6.28), s: rnd(0.5, 2) }));
  return {
    draw(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#03040a'); g.addColorStop(1, '#0a1030');
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const s of stars) { ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, 6.28); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
      for (const r of ribbons) {
        const top: number[] = []; const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const x = i / steps;
          top.push(h * (r.base + r.amp * Math.sin(x * r.f * 6.28 + t * r.sp + r.ph) + r.amp * 0.5 * Math.sin(x * r.f * 11 - t * r.sp * 1.7)));
        }
        const thick = h * 0.28;
        const grad = ctx.createLinearGradient(0, h * (r.base - 0.2), 0, h * (r.base + 0.3));
        grad.addColorStop(0, `rgba(${r.c},0)`); grad.addColorStop(0.45, `rgba(${r.c},0.30)`); grad.addColorStop(1, `rgba(${r.c},0)`);
        ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, top[0]);
        for (let i = 1; i <= steps; i++) ctx.lineTo((i / steps) * w, top[i]);
        for (let i = steps; i >= 0; i--) ctx.lineTo((i / steps) * w, top[i] + thick * (0.7 + 0.3 * Math.sin(t * 0.5 + i * 0.1)));
        ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function makeStars(): Scene {
  const N = 520;
  const stars = Array.from({ length: N }, () => ({ x: rnd(-1, 1), y: rnd(-1, 1), z: Math.random(), hue: rnd(210, 290) }));
  return {
    draw(ctx, w, h, t, dt) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(3,4,12,0.28)'; ctx.fillRect(0, 0, w, h);
      const cx = w / 2; const cy = h / 2;
      const pulse = 0.85 + 0.15 * Math.sin(t * 0.6);
      const neb = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
      neb.addColorStop(0, `rgba(139,92,246,${0.14 * pulse})`); neb.addColorStop(0.5, `rgba(59,130,246,${0.07 * pulse})`); neb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = neb; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const pz = s.z; s.z -= dt * 0.16;
        if (s.z <= 0.02) { s.x = rnd(-1, 1); s.y = rnd(-1, 1); s.z = 1; continue; }
        const k = 0.5 / s.z; const px = cx + (s.x * w * 0.5) * (0.5 / pz) * 0.5; const py = cy + (s.y * h * 0.5) * (0.5 / pz) * 0.5;
        const x = cx + s.x * w * 0.5 * k * 0.5; const y = cy + s.y * h * 0.5 * k * 0.5;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) { s.z = 1; continue; }
        const a = Math.min(1, (1 - s.z) * 1.4);
        ctx.strokeStyle = `hsla(${s.hue},90%,75%,${a})`; ctx.lineWidth = (1 - s.z) * 2.6 + 0.3;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function makeBokeh(): Scene {
  const orbs = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.03, 0.12), vx: rnd(-0.01, 0.01), vy: rnd(-0.03, -0.008), h: rnd(200, 320), p: rnd(0, 6.28), s: rnd(0.3, 0.9) }));
  return {
    draw(ctx, w, h, t, dt) {
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0b0620'); g.addColorStop(0.5, '#08102e'); g.addColorStop(1, '#04141f');
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const o of orbs) {
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (o.y < -0.2) { o.y = 1.2; o.x = Math.random(); }
        const R = o.r * Math.min(w, h) * (1 + 0.1 * Math.sin(t * o.s + o.p));
        const x = o.x * w + Math.sin(t * 0.2 + o.p) * 30; const y = o.y * h;
        const a = 0.16 + 0.1 * Math.sin(t * o.s * 1.3 + o.p);
        const rg = ctx.createRadialGradient(x, y, 0, x, y, R);
        rg.addColorStop(0, `hsla(${o.h},90%,65%,${a})`); rg.addColorStop(0.7, `hsla(${o.h},90%,55%,${a * 0.45})`); rg.addColorStop(1, `hsla(${o.h},90%,50%,0)`);
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.28); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function makeWaves(): Scene {
  const layers = [
    { c: '139,92,246', y: 0.62, a: 0.05, f: 1.3, s: 0.5, o: 0.22 }, { c: '99,102,241', y: 0.68, a: 0.045, f: 1.8, s: -0.4, o: 0.26 },
    { c: '59,130,246', y: 0.74, a: 0.04, f: 2.4, s: 0.55, o: 0.3 }, { c: '34,211,238', y: 0.81, a: 0.035, f: 3, s: -0.6, o: 0.32 }, { c: '14,116,144', y: 0.89, a: 0.03, f: 3.6, s: 0.7, o: 0.45 },
  ];
  return {
    draw(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0524'); g.addColorStop(0.6, '#1a0f45'); g.addColorStop(1, '#06122e');
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // glowing moon
      const mx = w * 0.72; const my = h * 0.3 + Math.sin(t * 0.1) * 12; const mr = Math.min(w, h) * 0.09;
      const mg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 4); mg.addColorStop(0, 'rgba(255,240,255,0.5)'); mg.addColorStop(0.25, 'rgba(180,140,255,0.18)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,248,255,0.92)'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.28); ctx.fill();
      for (const l of layers) {
        ctx.fillStyle = `rgba(${l.c},${l.o})`; ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) { const nx = x / w; ctx.lineTo(x, h * (l.y + l.a * Math.sin(nx * l.f * 6.28 + t * l.s) + l.a * 0.4 * Math.sin(nx * l.f * 13 - t * l.s * 1.4))); }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      }
    },
  };
}

// Neon "synthwave" horizon: striped sun, starry sky and a perspective grid rushing toward the viewer.
function makeGrid(): Scene {
  const stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random() * 0.5, r: rnd(0.4, 1.3), p: rnd(0, 6.28), s: rnd(0.6, 2) }));
  return {
    draw(ctx, w, h, t) {
      const hy = h * 0.58;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const sky = ctx.createLinearGradient(0, 0, 0, hy); sky.addColorStop(0, '#05021a'); sky.addColorStop(0.6, '#240a4e'); sky.addColorStop(1, '#8a1d7e');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hy);
      for (const s of stars) { ctx.globalAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, 6.28); ctx.fill(); }
      ctx.globalAlpha = 1;
      // sun with cut-out stripes in its lower half
      const cx = w / 2; const r = h * 0.2; const cy = hy - r * 0.15;
      const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 2.4); halo.addColorStop(0, 'rgba(255,80,170,0.45)'); halo.addColorStop(1, 'rgba(255,80,170,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, w, hy);
      const sg = ctx.createLinearGradient(0, cy - r, 0, cy + r); sg.addColorStop(0, '#ffe27a'); sg.addColorStop(0.55, '#ff7a59'); sg.addColorStop(1, '#ff2f92');
      ctx.fillStyle = sg;
      const slices = 44;
      for (let i = 0; i < slices; i++) {
        const y0 = cy - r + (i / slices) * 2 * r; const y1 = cy - r + ((i + 1) / slices) * 2 * r; const f = i / slices;
        if (f > 0.5 && ((i + Math.floor(t * 2)) % 5 < 2 + Math.floor((f - 0.5) * 6))) continue; // stripes, slowly crawling
        const ym = (y0 + y1) / 2; const half = Math.sqrt(Math.max(0, r * r - (ym - cy) * (ym - cy)));
        if (y0 > hy) continue;
        ctx.fillRect(cx - half, y0, half * 2, Math.min(y1, hy) - y0 + 0.5);
      }
      const ground = ctx.createLinearGradient(0, hy, 0, h); ground.addColorStop(0, '#1b0638'); ground.addColorStop(1, '#04010e');
      ctx.fillStyle = ground; ctx.fillRect(0, hy, w, h - hy);
      ctx.globalCompositeOperation = 'lighter';
      // vertical (converging) lines
      for (let i = -24; i <= 24; i++) {
        ctx.strokeStyle = 'rgba(255,60,200,0.16)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + i * w * 0.012, hy); ctx.lineTo(cx + i * w * 0.14, h); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,220,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // horizontal lines moving toward us
      const N = 16; const off = (t * 0.35) % 1;
      for (let k = 0; k < N; k++) {
        const z = (k + off) / N; const y = hy + (h - hy) * Math.pow(z, 2.4);
        ctx.strokeStyle = `rgba(255,60,200,${0.1 + z * 0.2})`; ctx.lineWidth = 2 + z * 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.strokeStyle = `rgba(120,220,255,${0.25 + z * 0.5})`; ctx.lineWidth = 0.8 + z * 1.2; ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

const FACTORY: Record<SceneName, () => Scene> = { aurora: makeAurora, stars: makeStars, bokeh: makeBokeh, waves: makeWaves, grid: makeGrid };

function Canvas({ scene, dim }: { scene: SceneName; dim: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const resize = () => { cv.width = Math.floor(window.innerWidth * dpr); cv.height = Math.floor(window.innerHeight * dpr); };
    resize(); window.addEventListener('resize', resize);
    const s = FACTORY[scene]();
    let raf = 0; let last = performance.now(); const t0 = last;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      s.draw(ctx, cv.width, cv.height, (now - t0) / 1000, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [scene]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ opacity: dim }} />;
}

export function Screensaver() {
  const { settings } = useApp();
  const { req } = useStore(playerStore);
  const preview = useStore(previewStore);
  const [on, setOn] = useState(false);
  const [imgs, setImgs] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [tick, setTick] = useState(0); // scene/art/position changes
  const [fade, setFade] = useState(1);
  const style = settings.screensaverStyle || 'auto';

  useEffect(() => {
    const mins = settings.screensaverMinutes;
    const t = setInterval(() => { if (preview.on) return; setOn(!!mins && !req && idleMs() > mins * 60000); }, 4000);
    return () => clearInterval(t);
  }, [settings.screensaverMinutes, req, preview.on]);
  useEffect(() => onActivity(() => { if (Date.now() < previewStore.get().ignoreUntil) return; setOn(false); if (previewStore.get().on) previewStore.set({ on: false }); }), []);
  const active = on || preview.on;
  useKeys(() => true, active); // the key that wakes the screensaver is consumed

  useEffect(() => {
    if (!active) return;
    setTick(0);
    const wantArt = style === 'artwork' || style === 'auto';
    if (wantArt) api.tmdb.status().then(async (s) => { if (s.hasKey) { const l = await api.tmdb.list('movie', 'popular'); setImgs(l.map((t) => t.backdrop).filter(Boolean)); } }).catch(() => undefined);
    const c = setInterval(() => setNow(Date.now()), 1000);
    const period = style === 'auto' ? 28000 : 20000;
    const t = setInterval(() => { setFade(0); setTimeout(() => { setTick((x) => x + 1); setFade(1); }, 1300); }, period);
    return () => { clearInterval(c); clearInterval(t); };
  }, [active, style]);

  if (!active) return null;
  const haveArt = imgs.length > 0;
  const order: (SceneName | 'art')[] = haveArt && (style === 'auto') ? ['aurora', 'art', 'grid', 'stars', 'bokeh', 'art', 'waves'] : SCENES;
  const scene: SceneName | 'art' = style === 'auto' ? order[tick % order.length] : style === 'artwork' ? (haveArt ? 'art' : 'aurora') : (style as SceneName);
  const img = imgs.length ? imgs[tick % imgs.length] : '';
  const spots = [{ left: '7%', top: '9%' }, { right: '7%', bottom: '11%' }, { left: '8%', bottom: '12%' }, { right: '8%', top: '10%' }, { left: '34%', top: '38%' }];
  const pos = spots[tick % spots.length];
  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-black fade-in">
      <div className="absolute inset-0 transition-opacity duration-[1300ms]" style={{ opacity: fade }}>
        {scene === 'art' && img ? <img key={img} src={img} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" style={{ animation: 'kenburns 26s ease-out forwards' }} /> : <Canvas key={scene} scene={scene === 'art' ? 'aurora' : scene} dim={1} />}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/35" />
      <div className="absolute transition-all duration-[4000ms] ease-in-out" style={pos}>
        <div className="font-extralight leading-none tracking-tight tabular-nums" style={{ fontSize: '9rem', textShadow: '0 0 3rem rgba(139,92,246,0.75), 0 0 8rem rgba(59,130,246,0.45)' }}>{fmtClock(now, true)}</div>
        <div className="mt-[0.8rem] text-[2rem] text-white/75" style={{ textShadow: '0 0 1.4rem rgba(0,0,0,0.8)' }}>{new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <div className="absolute bottom-[2rem] left-1/2 -translate-x-1/2 text-[1.1rem] text-white/45">Press any key or move the mouse to wake</div>
    </div>
  );
}
