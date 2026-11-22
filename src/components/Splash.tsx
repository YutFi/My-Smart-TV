import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { cancelSplash, splashStore, SPLASH_MS } from '../lib/splash';
import { useKeys } from '../lib/nav';

// Full-screen launch splash: colour burst in the app's brand colours, ripples, an orbiting ring, light streaks, sparkles,
// a pop-in logo tile with a shine sweep, and a progress bar that fills while the app starts.
export function Splash() {
  const { info, token } = useStore(splashStore);
  useKeys((e) => { if (e.k === 'back' || e.k === 'backspace' || e.k === 'home') { cancelSplash(); return true; } return true; }, !!info);
  const sparks = useMemo(() => Array.from({ length: 26 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, s: 0.2 + Math.random() * 0.5, d: Math.random() * 2, t: 1.4 + Math.random() * 1.6 })), [token]);
  const streaks = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ a: (360 / 14) * i + Math.random() * 12, d: Math.random() * 0.9, l: 18 + Math.random() * 22 })), [token]);
  if (!info) return null;
  const { color, color2 } = info;
  return (
    <div key={token} className="splash-root fixed inset-0 z-[95] flex flex-col items-center justify-center overflow-hidden" style={{ background: '#05060d' }}>
      <div className="splash-bg absolute inset-0" style={{ background: `radial-gradient(circle at 50% 48%, ${color}88 0%, ${color2}55 28%, #05060d 68%)` }} />
      <div className="splash-bg2 absolute inset-[-20%]" style={{ background: `conic-gradient(from 0deg, transparent, ${color}33, transparent 30%, ${color2}33, transparent 60%, ${color}22, transparent)` }} />
      {sparks.map((s, i) => <i key={i} className="splash-spark absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.s}rem`, height: `${s.s}rem`, animationDelay: `${s.d}s`, animationDuration: `${s.t}s` }} />)}
      <div className="absolute left-1/2 top-[46%]">
        {streaks.map((s, i) => <b key={i} className="splash-streak absolute block h-[0.14rem] origin-left rounded-full" style={{ width: `${s.l}rem`, transform: `rotate(${s.a}deg)`, animationDelay: `${0.25 + s.d}s`, background: `linear-gradient(90deg, transparent, ${color}, #fff)` }} />)}
      </div>
      <div className="relative flex h-[24rem] w-[24rem] items-center justify-center" style={{ marginTop: '-4rem' }}>
        {[0, 0.5, 1].map((d) => <i key={d} className="splash-ripple absolute inset-0 rounded-full border-2" style={{ borderColor: color, animationDelay: `${d}s` }} />)}
        <i className="splash-ring absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 0deg, transparent 0%, ${color} 35%, #fff 50%, transparent 62%)`, WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 0.4rem), #000 calc(100% - 0.35rem))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 0.4rem), #000 calc(100% - 0.35rem))' }} />
        <div className="splash-logo relative flex items-center justify-center overflow-hidden rounded-[1.6rem] shadow-2xl" style={{ width: '17rem', height: '10.2rem', background: `linear-gradient(135deg, ${color}, ${color2})`, boxShadow: `0 0 5rem ${color}aa, 0 1.5rem 3rem rgba(0,0,0,0.6)` }}>
          <span className="px-[1rem] text-center text-[3.4rem] font-black leading-none tracking-tight text-white drop-shadow-lg">{info.text || info.title}</span>
          <i className="splash-shine absolute inset-0" />
        </div>
      </div>
      <div className="splash-title relative mt-[-1rem] text-center">
        <div className="text-[1rem] font-bold uppercase tracking-[0.45em] text-white/60">Opening</div>
        <div className="mt-[0.2rem] text-[2.8rem] font-black tracking-tight text-white" style={{ textShadow: `0 0 2.4rem ${color}` }}>{info.title}</div>
        {info.gaming && <div className="splash-chip mx-auto mt-[0.8rem] inline-flex items-center gap-[0.5rem] rounded-full border border-white/25 bg-white/10 px-[1.1rem] py-[0.3rem] text-[1rem] font-bold tracking-widest text-white">🎮 GAME MODE ON</div>}
      </div>
      <div className="relative mt-[1.6rem] h-[0.35rem] w-[24rem] overflow-hidden rounded-full bg-white/15">
        <i className="splash-bar block h-full rounded-full" style={{ background: `linear-gradient(90deg, ${color}, #fff)`, animationDuration: `${SPLASH_MS}ms` }} />
      </div>
      <div className="absolute bottom-[2.4rem] text-[1rem] text-white/40">Press Back to cancel</div>
    </div>
  );
}
