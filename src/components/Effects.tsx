import { useEffect, useRef } from 'react';
import { playerStore, useApp } from '../lib/app';
import { useStore } from '../lib/store';
import { splashStore } from '../lib/splash';

// ---------------------------------------------------------------------------------------------------------------------
// Ambient visual effects: a canvas of slowly drifting glow particles behind the UI, and a soft light that follows the
// focused item. Both stop while a video/game is on screen so they never compete for the GPU.
// ---------------------------------------------------------------------------------------------------------------------

function sprite(hue: number, size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d')!; const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `hsla(${hue},95%,72%,1)`); g.addColorStop(0.35, `hsla(${hue},90%,62%,0.45)`); g.addColorStop(1, `hsla(${hue},90%,55%,0)`);
  x.fillStyle = g; x.fillRect(0, 0, size, size); return c;
}

// hues of the current theme's three accent colours, so the floating light follows the chosen theme
function themeHues(): number[] {
  const cs = getComputedStyle(document.documentElement);
  const hue = (v: string) => { const [r, g, b] = cs.getPropertyValue(v).trim().split(/\s+/).map(Number); if ([r, g, b].some((n) => Number.isNaN(n))) return 260; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; if (!d) return 260; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (Math.round(h * 60) + 360) % 360; };
  const a = hue('--ap'); const b = hue('--ab'); const c = hue('--ac');
  return [a, b, c, (a + 25) % 360, (b + 335) % 360];
}

export function AmbientBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { req } = useStore(playerStore);
  const { settings } = useApp();
  const { info: splash } = useStore(splashStore);
  const on = settings.animatedBackground && !req && !splash;
  useEffect(() => {
    if (!on) return;
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const sprites = themeHues().map((h) => sprite(h));
    const W = () => cv.width; const H = () => cv.height;
    const resize = () => { const k = 0.5; cv.width = Math.floor(window.innerWidth * k); cv.height = Math.floor(window.innerHeight * k); };
    resize(); window.addEventListener('resize', resize);
    const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.004 + Math.random() * 0.012, r: 0.006 + Math.random() * 0.016, sp: Math.floor(Math.random() * sprites.length), p: Math.random() * 6.28, tw: 0.4 + Math.random() * 1.2 }));
    const glows = Array.from({ length: 4 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.35 + Math.random() * 0.25, vx: (Math.random() - 0.5) * 0.008, vy: (Math.random() - 0.5) * 0.008, sp: i % sprites.length }));
    let raf = 0; let last = 0; const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return; // ~30 fps is plenty for ambient motion
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W(), H());
      ctx.globalCompositeOperation = 'lighter';
      for (const g of glows) {
        g.x += g.vx * dt * 6; g.y += g.vy * dt * 6;
        if (g.x < -0.1 || g.x > 1.1) g.vx *= -1; if (g.y < -0.1 || g.y > 1.1) g.vy *= -1;
        const s = g.r * Math.max(W(), H()); ctx.globalAlpha = 0.17; ctx.drawImage(sprites[g.sp], g.x * W() - s / 2, g.y * H() - s / 2, s, s);
      }
      for (const d of dust) {
        d.y -= d.s * dt; d.x += Math.sin(t * 0.3 + d.p) * 0.0004;
        if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
        const s = d.r * Math.max(W(), H()) * 2; ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * d.tw + d.p));
        ctx.drawImage(sprites[d.sp], d.x * W() - s / 2, d.y * H() - s / 2, s, s);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [on, settings.theme]);
  if (!on) return null;
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: 0.9 }} />;
}

// A soft pool of light that glides to whatever is focused.
export function FocusGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const { req } = useStore(playerStore);
  const { settings } = useApp();
  const on = settings.animatedBackground && !req;
  useEffect(() => {
    if (!on) return;
    const g = ref.current!; let raf = 0; let lastKey = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.hasAttribute('data-f') || el.closest('[data-hscroll-ignore]')) { g.style.opacity = '0'; return; }
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) { g.style.opacity = '0'; return; }
      const s = Math.max(r.width, r.height) * 2.4;
      const key = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(s)}`;
      if (key === lastKey) return; lastKey = key;
      g.style.width = g.style.height = `${s}px`;
      g.style.transform = `translate3d(${r.left + r.width / 2 - s / 2}px, ${r.top + r.height / 2 - s / 2}px, 0)`;
      g.style.opacity = '1';
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  if (!on) return null;
  return <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-[5] rounded-full" style={{ opacity: 0, background: 'radial-gradient(closest-side, rgb(var(--ap) / 0.42), rgb(var(--ab) / 0.16) 55%, transparent)', transition: 'transform .38s cubic-bezier(.2,.7,.2,1), width .38s, height .38s, opacity .3s', willChange: 'transform' }} />;
}
