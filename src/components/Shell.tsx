import { useEffect, useState } from 'react';
import { Focusable } from './ui';
import { nav, useApp, useRoute, toastStore, TABS } from '../lib/app';
import { useStore } from '../lib/store';
import { fmtClock } from '../lib/format';
import { Wallpaper } from './Wallpaper';
import { BatteryBadge } from './Battery';
import { useClock } from '../lib/clock';

const TAB_META: Record<string, { label: string; icon: string }> = {
  home: { label: 'HOME', icon: '🏠' }, live: { label: 'LIVE TV', icon: '📺' }, movies: { label: 'MOVIES', icon: '🎬' }, series: { label: 'SERIES', icon: '🎞️' },
  sports: { label: 'SPORTS', icon: '⚽' }, apps: { label: 'APPS', icon: '🧩' }, youtube: { label: 'YOUTUBE', icon: '▶️' }, music: { label: 'MUSIC', icon: '🎵' },
  media: { label: 'MY MEDIA', icon: '💾' }, favorites: { label: 'FAVORITES', icon: '⭐' }, search: { label: 'SEARCH', icon: '🔍' }, settings: { label: 'SETTINGS', icon: '⚙️' },
};
const ICON_ONLY = new Set(['search', 'settings']);

export { useClock };

const I18N: Record<string, Record<string, string>> = {
  ms: { home: 'UTAMA', live: 'TV LANGSUNG', movies: 'FILEM', series: 'SIRI', sports: 'SUKAN', apps: 'APLIKASI', youtube: 'YOUTUBE', music: 'MUZIK', media: 'MEDIA SAYA', favorites: 'KEGEMARAN', search: 'CARI', settings: 'TETAPAN' },
  zh: { home: '主页', live: '直播电视', movies: '电影', series: '剧集', sports: '体育', apps: '应用', youtube: 'YOUTUBE', music: '音乐', media: '我的媒体', favorites: '收藏', search: '搜索', settings: '设置' },
  ta: { home: 'முகப்பு', live: 'நேரலை', movies: 'திரைப்படம்', series: 'தொடர்', sports: 'விளையாட்டு', apps: 'செயலிகள்', youtube: 'YOUTUBE', music: 'இசை', media: 'என் மீடியா', favorites: 'விருப்பம்', search: 'தேடு', settings: 'அமைப்புகள்' },
};
const KIDS_HIDDEN = new Set(['sports', 'apps', 'youtube', 'settings']);

export function TopNav({ onProfile, onPower }: { onProfile: () => void; onPower: () => void }) {
  const { route, stack } = useRoute();
  const { profile, online, settings } = useApp();
  const now = useClock();
  const active = route.page;
  const label = (t: string) => I18N[settings.language]?.[t] || TAB_META[t].label;
  return (
    <header className="relative z-30 flex items-center gap-[0.8rem] px-[3.5rem] pb-[0.5rem] pt-[1.6rem]">
      <div className="mr-[0.4rem] flex shrink-0 items-center gap-[0.7rem]">
        <div className="flex h-[2.8rem] w-[2.8rem] items-center justify-center rounded-[0.8rem] bg-gradient-to-br from-accent-purple to-accent-blue text-[1.5rem] font-black shadow-lg shadow-accent-purple/40">▶</div>
        <div className="whitespace-nowrap text-[1.05rem] font-black leading-[1.15] tracking-[0.18em]">MY<br /><span className="text-accent-cyan">SMART TV</span></div>
      </div>
      <Focusable fk="tab:back" onSelect={() => nav.back()} title="Back" className={`f-btn flex shrink-0 items-center px-[0.9rem] py-[0.5rem] text-[1.05rem] font-bold ${active === 'home' && !stack.length ? 'opacity-50' : ''}`}>◀</Focusable>
      <nav className="flex flex-1 items-center gap-[0.15rem]">
        {TABS.filter((t) => !(profile?.kids && KIDS_HIDDEN.has(t))).map((t) => {
          const m = TAB_META[t];
          return (
            <Focusable key={t} fk={`tab:${t}`} onSelect={() => nav.go(t)} title={label(t)} className={`f-tab flex items-center gap-[0.45rem] whitespace-nowrap px-[0.55rem] py-[0.5rem] text-[0.92rem] font-bold tracking-wide ${active === t ? 'active' : ''}`}>
              <span className="text-[1.15rem]">{m.icon}</span>{!ICON_ONLY.has(t) && <span>{label(t)}</span>}
            </Focusable>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-[0.7rem] text-[1.1rem]">
        <span title={online ? 'Online' : 'Offline'} className={`flex items-center gap-[0.3rem] text-[1rem] ${online ? 'text-emerald-400' : 'text-amber-400'}`}>{online ? '●' : '⚠ Offline'}</span>
        <BatteryBadge />
        <span className="whitespace-nowrap text-[1.35rem] font-semibold tabular-nums">{fmtClock(now)}</span>
        <Focusable fk="tab:profile" onSelect={onProfile} title="Switch profile" className="f-tab flex h-[2.9rem] w-[2.9rem] items-center justify-center text-[1.6rem]" style={{ background: profile?.color }}>{profile?.avatar || '😀'}</Focusable>
        <Focusable fk="tab:power" onSelect={onPower} title="Power menu" className="f-tab flex h-[2.9rem] w-[2.9rem] items-center justify-center text-[1.4rem]">⏻</Focusable>
      </div>
    </header>
  );
}

export function Toasts() {
  const { items } = useStore(toastStore);
  return (
    <div className="pointer-events-none fixed bottom-[3rem] left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-[0.6rem]">
      {items.map((t) => (
        <div key={t.id} className={`page-enter max-w-[60rem] rounded-full px-[1.8rem] py-[0.8rem] text-[1.2rem] font-semibold shadow-xl ${t.kind === 'error' ? 'bg-red-600' : t.kind === 'ok' ? 'bg-emerald-600' : 'bg-ink-600 border border-white/15'}`}>{t.msg}</div>
      ))}
    </div>
  );
}

export function Background() {
  return <div className="bg-cinema absolute inset-0"><Wallpaper /></div>;
}
