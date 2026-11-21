import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { idleMs, onActivity, useKeys } from '../lib/nav';
import { playerStore, useApp } from '../lib/app';
import { useStore } from '../lib/store';
import { fmtClock } from '../lib/format';

// Ambient screensaver: slow artwork montage + moving clock, shown after inactivity when nothing is playing.
export function Screensaver() {
  const { settings } = useApp();
  const { req } = useStore(playerStore);
  const [on, setOn] = useState(false);
  const [imgs, setImgs] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const mins = settings.screensaverMinutes;
    if (!mins) { setOn(false); return; }
    const t = setInterval(() => setOn(!req && idleMs() > mins * 60000), 5000);
    return () => clearInterval(t);
  }, [settings.screensaverMinutes, req]);
  useEffect(() => onActivity(() => setOn(false)), []);
  useKeys(() => true, on); // the key that wakes the screensaver is consumed
  useEffect(() => {
    if (!on) return;
    api.tmdb.status().then(async (s) => { if (s.hasKey) { const l = await api.tmdb.list('movie', 'popular'); setImgs(l.map((t) => t.backdrop).filter(Boolean)); } }).catch(() => undefined);
    const t = setInterval(() => { setI((x) => x + 1); setNow(Date.now()); }, 12000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [on]);
  if (!on) return null;
  const img = imgs.length ? imgs[i % imgs.length] : '';
  const pos = [{ left: '6%', top: '10%' }, { right: '6%', bottom: '12%' }, { left: '8%', bottom: '14%' }, { right: '8%', top: '12%' }][i % 4];
  return (
    <div className="fixed inset-0 z-[90] bg-black fade-in">
      {img && <img key={img} src={img} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" style={{ animation: 'kenburns 24s ease-out forwards, fadeIn 2s ease both' }} />}
      {!img && <div className="bg-cinema absolute inset-0"><div className="aurora"><i /><i /><i /></div></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/50" />
      <div className="absolute transition-all duration-[3000ms]" style={pos}>
        <div className="text-[9rem] font-extralight leading-none tracking-tight text-shadow tabular-nums">{fmtClock(now, true)}</div>
        <div className="mt-[0.6rem] text-[2rem] text-white/70">{new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <div className="absolute bottom-[2rem] left-1/2 -translate-x-1/2 text-[1.1rem] text-white/40">Press any key to wake</div>
    </div>
  );
}
