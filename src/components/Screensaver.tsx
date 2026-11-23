import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { idleMs, onActivity, useKeys } from '../lib/nav';
import { playerStore, useApp } from '../lib/app';
import { createStore, useStore } from '../lib/store';
import { fmtClock } from '../lib/format';
import { play } from '../lib/sfx';
import { FACTORY, SCENES, type SceneName } from '../lib/scenes';

// ---------------------------------------------------------------------------------------------------------------------
// Ambient screensaver: animated canvas scenes (aurora, starfield, bokeh, waves) + optional artwork slideshow, with a
// softly glowing clock that drifts around the screen. Shown after inactivity when nothing is playing.
// ---------------------------------------------------------------------------------------------------------------------

const previewStore = createStore<{ on: boolean; ignoreUntil: number }>({ on: false, ignoreUntil: 0 });
export const previewScreensaver = () => previewStore.set({ on: true, ignoreUntil: Date.now() + 1800 });

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
  const swelled = useRef(false);
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
  useEffect(() => { if (active) play('swell'); else if (swelled.current) play('wake'); swelled.current = active; }, [active]);
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
