import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui';

export interface HeroSlide {
  id: string; title: string; overview: string; backdrop?: string; tag?: string; meta?: string;
  actions: { label: string; icon?: string; primary?: boolean; onSelect: () => void }[];
}

export function Hero({ slides, extra }: { slides: HeroSlide[]; extra?: ReactNode }) {
  const [i, setI] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const hover = useRef(false);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => { if (!hover.current) setI((x) => (x + 1) % slides.length); }, 9000);
    return () => clearInterval(t);
  }, [slides.length]);
  useEffect(() => { if (i >= slides.length) setI(0); }, [slides.length, i]);
  const s = slides[i] || slides[0];
  if (!s) return null;
  return (
    <div ref={holder} className="relative mb-[1.2rem] h-[40vh] min-h-[22rem] overflow-hidden" style={{ WebkitMaskImage: 'linear-gradient(to bottom, #000 72%, transparent)', maskImage: 'linear-gradient(to bottom, #000 72%, transparent)' }} onFocusCapture={() => (hover.current = true)} onBlurCapture={() => (hover.current = false)}>
      {slides.map((sl, idx) => (
        <div key={sl.id} className="absolute inset-0 transition-opacity duration-[1200ms]" style={{ opacity: idx === i ? 1 : 0 }}>
          {sl.backdrop ? <img src={sl.backdrop} alt="" className="h-full w-full object-cover" style={{ animation: idx === i ? 'kenburns 18s ease-out forwards' : undefined }} /> : <div className="h-full w-full bg-gradient-to-br from-accent-purple/40 via-ink-700 to-accent-blue/30" />}
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
      <div key={s.id} className="page-enter absolute bottom-[2.6rem] left-[3.5rem] max-w-[52rem]">
        {s.tag && <div className="mb-[0.6rem] inline-block rounded-md bg-accent-purple/80 px-[0.7rem] py-[0.15rem] text-[0.95rem] font-bold uppercase tracking-widest">{s.tag}</div>}
        <h1 className="text-[3.6rem] font-black leading-[1.05] tracking-tight text-shadow">{s.title}</h1>
        {s.meta && <div className="mt-[0.5rem] text-[1.2rem] font-semibold text-accent-cyan">{s.meta}</div>}
        <p className="clamp-3 mt-[0.8rem] max-w-[46rem] text-[1.2rem] leading-snug text-white/80 text-shadow">{s.overview}</p>
        <div className="mt-[1.2rem] flex gap-[0.9rem]">
          {s.actions.map((a, idx) => <Button key={a.label} fk={`hero:${s.id}:${idx}`} autoFocus={idx === 0} primary={a.primary} icon={a.icon} onSelect={a.onSelect}>{a.label}</Button>)}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-[1.2rem] right-[3.5rem] flex gap-[0.4rem]">
          {slides.map((sl, idx) => <i key={sl.id} className={`h-[0.4rem] rounded-full transition-all ${idx === i ? 'w-[2.4rem] bg-white' : 'w-[0.8rem] bg-white/30'}`} />)}
        </div>
      )}
      {extra}
    </div>
  );
}
