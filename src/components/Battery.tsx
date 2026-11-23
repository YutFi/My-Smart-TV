import { fmtLeft, useBattery } from '../lib/battery';
import { useClock } from '../lib/clock';
import { fmtClock } from '../lib/format';

const colorFor = (p: number, charging: boolean) => (charging || p > 50 ? '#34d399' : p > 20 ? '#fbbf24' : '#f87171');

// Small battery glyph + percentage (hidden on PCs without a battery).
export function BatteryBadge() {
  const b = useBattery();
  if (!b.present) return null;
  const c = colorFor(b.percent, b.charging);
  return (
    <span title={b.charging ? 'Charging' : b.pluggedIn ? 'Plugged in' : 'On battery'} className={`flex items-center gap-[0.4rem] text-[1.1rem] font-bold ${!b.charging && b.percent <= 20 ? 'animate-pulse' : ''}`} style={{ color: c }}>
      <span className="relative inline-block h-[1.05rem] w-[2.1rem] rounded-[0.25rem] border-2" style={{ borderColor: c }}>
        <i className="absolute inset-[0.12rem] right-auto rounded-[0.1rem]" style={{ width: `${Math.max(6, b.percent) * 0.92}%`, background: c, transition: 'width .6s' }} />
        <i className="absolute -right-[0.4rem] top-[0.15rem] h-[0.5rem] w-[0.25rem] rounded-r" style={{ background: c }} />
      </span>
      {b.percent}%{b.charging && <span className="text-[1rem]">⚡</span>}
    </span>
  );
}

// Home screen glance card: big clock + date, battery ring with charging/runtime info.
export function StatusWidget() {
  const now = useClock();
  const b = useBattery();
  const c = colorFor(b.percent, b.charging);
  const R = 2.6; const C = 2 * Math.PI * R;
  return (
    <div className="glass float-slow absolute right-[3.5rem] top-[1.2rem] z-20 flex items-center gap-[1.6rem] rounded-[1.4rem] px-[1.8rem] py-[1.1rem]">
      <div>
        <div className="text-[3.2rem] font-light leading-none tabular-nums" style={{ textShadow: '0 0 1.6rem rgba(139,92,246,0.6)' }}>{fmtClock(now)}</div>
        <div className="mt-[0.4rem] text-[1.1rem] text-white/65">{new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      {b.present && (
        <div className="flex items-center gap-[0.9rem] border-l border-white/15 pl-[1.6rem]">
          <svg viewBox="0 0 6.4 6.4" className={`h-[4.6rem] w-[4.6rem] -rotate-90 ${b.charging ? 'animate-pulse' : ''}`}>
            <circle cx="3.2" cy="3.2" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.45" />
            <circle cx="3.2" cy="3.2" r={R} fill="none" stroke={c} strokeWidth="0.45" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - b.percent / 100)} style={{ transition: 'stroke-dashoffset .8s ease, stroke .4s' }} />
          </svg>
          <div>
            <div className="text-[2rem] font-bold leading-none" style={{ color: c }}>{b.percent}%</div>
            <div className="mt-[0.3rem] text-[0.95rem] text-white/65">{b.charging ? '⚡ Charging' : b.pluggedIn ? 'Plugged in' : fmtLeft(b.minutes) || 'On battery'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
