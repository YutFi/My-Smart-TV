import { useMemo } from 'react';
import { useKeys } from '../lib/nav';

// Intro shown every time MY SMART TV starts: aurora backdrop, a rotating light ring around the logo, ripples, sparkles,
// a letter-by-letter wordmark and a progress bar. It fades away once the app has loaded (and the intro has played).
export function BootSplash({ fading }: { fading: boolean }) {
  useKeys(() => true, !fading); // swallow keys during the intro
  const sparks = useMemo(() => Array.from({ length: 32 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, s: 0.2 + Math.random() * 0.45, d: Math.random() * 2.4, t: 1.6 + Math.random() * 1.8 })), []);
  const letters = 'MY SMART TV'.split('');
  return (
    <div className="boot-root fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden bg-[#05060d]" style={{ transition: 'opacity .7s ease, transform .7s ease', opacity: fading ? 0 : 1, transform: fading ? 'scale(1.05)' : 'none', pointerEvents: fading ? 'none' : 'auto' }}>
      <div className="bg-cinema absolute inset-0"><div className="aurora"><i /><i /><i /></div></div>
      <div className="splash-bg2 absolute inset-[-60%]" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(139,92,246,0.28), transparent 30%, rgba(34,211,238,0.22), transparent 60%, rgba(59,130,246,0.25), transparent)' }} />
      {sparks.map((s, i) => <i key={i} className="splash-spark absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.s}rem`, height: `${s.s}rem`, animationDelay: `${s.d}s`, animationDuration: `${s.t}s` }} />)}
      <div className="relative flex h-[22rem] w-[22rem] items-center justify-center" style={{ marginTop: '-3rem' }}>
        {[0, 0.6, 1.2].map((d) => <i key={d} className="splash-ripple absolute inset-0 rounded-full border-2" style={{ borderColor: '#8b5cf6', animationDelay: `${d}s` }} />)}
        <i className="splash-ring absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, transparent 0%, #8b5cf6 30%, #22d3ee 48%, #fff 52%, transparent 62%)', WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 0.4rem), #000 calc(100% - 0.35rem))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 0.4rem), #000 calc(100% - 0.35rem))' }} />
        <div className="splash-logo relative flex h-[11rem] w-[11rem] items-center justify-center overflow-hidden rounded-[2.6rem] bg-gradient-to-br from-accent-purple to-accent-blue text-[5.4rem] text-white" style={{ boxShadow: '0 0 6rem rgba(139,92,246,0.8), 0 1.5rem 3rem rgba(0,0,0,0.6)' }}>
          <span style={{ marginLeft: '0.5rem' }}>▶</span>
          <i className="splash-shine absolute inset-0" />
        </div>
      </div>
      <div className="relative mt-[0.4rem] flex text-[4.4rem] font-black tracking-[0.18em] text-white" style={{ textShadow: '0 0 3rem rgba(139,92,246,0.9)' }}>
        {letters.map((ch, i) => <span key={i} className="boot-letter" style={{ animationDelay: `${0.9 + i * 0.07}s`, color: i >= 3 ? '#67e8f9' : '#fff', width: ch === ' ' ? '1.6rem' : undefined }}>{ch}</span>)}
      </div>
      <div className="boot-tag relative mt-[0.6rem] text-[1.5rem] font-medium tracking-[0.5em] text-white/55">YOUR PC · YOUR SMART TV</div>
      <div className="relative mt-[2.4rem] h-[0.35rem] w-[26rem] overflow-hidden rounded-full bg-white/15"><i className="boot-bar block h-full w-full rounded-full bg-gradient-to-r from-accent-purple via-accent-cyan to-white" /></div>
    </div>
  );
}
