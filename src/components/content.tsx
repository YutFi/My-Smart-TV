import { useEffect, useState, type ReactNode } from 'react';
import { Art, Card, Focusable } from './ui';
import { api, type Game, type Title } from '../lib/api';
import { channelRequest, localRequest, nav, pid, playMedia, toast } from '../lib/app';
import { STREAMING_APPS, type HistoryItem, type ListItem } from '../../shared/types';
import { fmtClock, fmtDay } from '../lib/format';
import { launchWithSplash } from '../lib/splash';

export const openTitle = (t: { kind: 'movie' | 'tv'; id: number }) => nav.push('title', { kind: t.kind, id: t.id });

export function TitleCard({ t, fk, shape = 'poster', progress }: { t: Title; fk: string; shape?: 'poster' | 'wide'; progress?: number }) {
  return <Card fk={fk} title={t.title} sub={`${t.year || ''}${t.rating ? ` · ★ ${t.rating}` : ''}`} image={shape === 'wide' ? t.backdrop || t.poster : t.poster} shape={shape} progress={progress} onSelect={() => openTitle(t)} />;
}

const hueOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
export const splashColors = (name: string) => { const h = hueOf(name); return { color: `hsl(${h} 70% 50%)`, color2: `hsl(${(h + 40) % 360} 75% 22%)` }; };

export async function launchApp(id: string) {
  const a = STREAMING_APPS.find((x) => x.id === id);
  const r = await launchWithSplash({ title: a?.name || id, text: a?.text, color: a?.color || '#8b5cf6', color2: a?.color2 || '#1e1b4b', gaming: a?.gaming }, () => api.launch.app(pid(), id));
  if (r.error === 'cancelled') return;
  if (!r.ok) toast(r.error || 'Could not open the app', 'error');
  else if (a?.gaming) toast(`Opening ${a.name} — gaming mode on. Click ⌂ MY SMART TV (top-left) to come back`, 'info', 6000);
  else toast(`Opening ${a?.name}… click ⌂ MY SMART TV (top-left) or press Ctrl+Alt+H to come back`, 'info', 5000);
}

// Desktop clients found on this PC (e.g. Nebula) with their real icons — looked up once.
let nativePromise: Promise<Record<string, { path: string; icon: string }>> | null = null;
export function useNativeApps() {
  const [v, setV] = useState<Record<string, { path: string; icon: string }>>({});
  useEffect(() => { nativePromise ||= api.launch.nativeApps().catch(() => ({})); nativePromise.then(setV); }, []);
  return v;
}

export async function openYoutubeVideo(v: { id: string; title: string; thumb: string }) {
  api.history.record(pid(), { kind: 'youtube', ref: v.id, title: v.title, image: v.thumb, sub: 'YouTube' }).catch(() => undefined);
  const r = await launchWithSplash({ title: 'YouTube', text: 'YouTube', color: '#ff0033', color2: '#8a0019' }, () => api.launch.url(`https://www.youtube.com/watch?v=${v.id}`, { label: 'YouTube' }));
  if (!r.ok && r.error !== 'cancelled') toast(r.error || 'Could not open YouTube', 'error');
}

// Open any saved item (history / favorites / watchlist) by its kind.
export async function openListItem(it: ListItem | HistoryItem, resume = true) {
  switch (it.kind) {
    case 'channel': {
      const [c] = await api.channels.list({ ids: [Number(it.ref)] });
      if (!c) { toast('That channel is no longer in your playlists.', 'error'); return; }
      const all = await api.channels.list({ playlistId: c.playlistId });
      playMedia(channelRequest(c, all));
      return;
    }
    case 'movie': case 'tv': nav.push('title', { kind: it.kind, id: Number(it.ref) }); return;
    case 'media': {
      const m = await api.library.get(Number(it.ref));
      if (!m) { toast('That file is no longer available. Check that the drive is connected.', 'error'); return; }
      playMedia(await localRequest(m, resume));
      return;
    }
    case 'app': launchApp(it.ref); return;
    case 'youtube': openYoutubeVideo({ id: it.ref, title: it.title, thumb: it.image }); return;
    case 'station': playMedia({ type: 'audio', url: it.data?.url || it.ref, title: it.title, subtitle: it.sub, image: it.image, kind: 'station', ref: it.ref, isRadio: true, data: it.data }); return;
    case 'team': nav.go('sports'); return;
    case 'uwp': {
      api.launch.addRecent(pid(), `uwp:${it.ref}`).catch(() => undefined);
      const r = await launchWithSplash({ title: it.title, ...splashColors(it.title) }, () => api.launch.shellApp(it.ref));
      if (r.error === 'cancelled') return;
      if (!r.ok) toast(r.error || 'Could not open the app', 'error');
      else toast(`Opening ${it.title}… click ⌂ MY SMART TV (top-left) to come back`, 'info', 5000);
      return;
    }
    case 'exe': {
      api.launch.addRecent(pid(), `exe:${it.ref}`).catch(() => undefined);
      const r = await launchWithSplash({ title: it.title, gaming: true, ...splashColors(it.title) }, () => api.launch.exe(it.ref, it.title));
      if (r.error === 'cancelled') return;
      if (!r.ok) toast(r.error || 'Could not start the program', 'error');
      else toast(`Opening ${it.title} — gaming mode on. Click ⌂ MY SMART TV (top-left) to come back`, 'info', 6000);
      return;
    }
    case 'site': {
      api.launch.addRecent(pid(), `site:${it.ref}`).catch(() => undefined);
      const r = await launchWithSplash({ title: it.title, ...splashColors(it.title) }, () => api.launch.url(it.ref, { label: it.title }));
      if (r.error === 'cancelled') return;
      if (!r.ok) toast(r.error || 'Could not open the website', 'error');
      else toast(`Opening ${it.title}… use the ⌂ MY SMART TV button (top-left) to come back`, 'info', 5000);
      return;
    }
  }
}

export function ListItemCard({ it, fk, shape, progress }: { it: ListItem | HistoryItem; fk: string; shape?: 'poster' | 'wide' | 'logo' | 'square'; progress?: number }) {
  const sh = shape || (it.kind === 'channel' || it.kind === 'station' ? 'logo' : it.kind === 'youtube' ? 'wide' : it.kind === 'app' ? 'logo' : 'poster');
  const app = it.kind === 'app' ? STREAMING_APPS.find((a) => a.id === it.ref) : null;
  if (app) return <AppTile app={app} fk={fk} />;
  return <Card fk={fk} shape={sh} title={it.title} sub={it.sub} image={it.image} progress={progress} live={it.kind === 'channel'} onSelect={() => openListItem(it)} fit={it.kind === 'channel' ? 'contain' : 'cover'} />;
}

export function AppTile({ app, fk, autoFocus }: { app: (typeof STREAMING_APPS)[number]; fk: string; autoFocus?: boolean }) {
  const native = useNativeApps()[app.id];
  return (
    <div className="shrink-0 px-[0.55rem] py-[0.9rem]" style={{ width: '15.1rem' }}>
      <Focusable fk={fk} autoFocus={autoFocus} onSelect={() => launchApp(app.id)} className="f-card relative flex items-center justify-center gap-[0.6rem] overflow-hidden rounded-[1rem]" style={{ width: '14rem', height: '8.4rem', background: `linear-gradient(135deg, ${app.color}, ${app.color2})` }}>
        {native?.icon && <img src={native.icon} alt="" className="h-[3.2rem] w-[3.2rem] drop-shadow-lg" draggable={false} />}
        <span className="px-[0.4rem] text-center text-[1.75rem] font-black leading-none tracking-tight text-white drop-shadow-lg">{app.text}</span>
        {native && <span className="absolute left-[0.6rem] top-[0.5rem] rounded bg-black/45 px-[0.4rem] py-[0.05rem] text-[0.7rem] font-bold text-white/90">🖥 DESKTOP APP</span>}
        <span className="absolute bottom-[0.45rem] right-[0.7rem] text-[0.75rem] font-semibold text-white/70">{app.name}</span>
      </Focusable>
    </div>
  );
}

// Tile for a website the user added (Apps → Add a website). Same look as the app tiles, colored from the name.
export function SiteTile({ it, fk, onKey }: { it: ListItem; fk: string; onKey?: (e: any) => boolean | void }) {
  let h = 0; for (let i = 0; i < it.title.length; i++) h = (h * 31 + it.title.charCodeAt(i)) % 360;
  const isExe = it.kind === 'exe' || it.kind === 'uwp';
  let host = ''; try { host = isExe ? 'Windows app' : new URL(it.ref).host.replace(/^www\./, ''); } catch { /* ignore */ }
  const [icon, setIcon] = useState('');
  useEffect(() => { if (it.kind === 'exe') api.launch.icon(it.ref).then(setIcon).catch(() => undefined); }, [it.kind, it.ref]);
  return (
    <div className="shrink-0 px-[0.55rem] py-[0.9rem]" style={{ width: '15.1rem' }}>
      <Focusable fk={fk} onSelect={() => openListItem(it)} onKey={onKey} className="f-card relative flex items-center justify-center overflow-hidden rounded-[1rem]" style={{ width: '14rem', height: '8.4rem', background: `linear-gradient(135deg, hsl(${h} 65% 42%), hsl(${(h + 40) % 360} 70% 18%))` }}>
        {icon && <img src={icon} alt="" className="mr-[0.4rem] h-[3rem] w-[3rem] drop-shadow-lg" draggable={false} />}
        <span className="clamp-2 px-[0.6rem] text-center text-[1.5rem] font-black leading-tight tracking-tight text-white drop-shadow-lg">{it.title}</span>
        <span className="absolute bottom-[0.45rem] left-[0.7rem] text-[0.75rem] font-semibold text-white/70">{it.kind === 'uwp' ? '🧩' : isExe ? '🖥' : '🌐'} {host}</span>
      </Focusable>
    </div>
  );
}

// Any other website launch gets the same splash + toast treatment.
export async function launchSite(url: string, title: string) {
  const r = await launchWithSplash({ title, ...splashColors(title) }, () => api.launch.url(url, { label: title }));
  if (r.error === 'cancelled') return;
  if (!r.ok) toast(r.error || 'Could not open the website', 'error');
}

export function GameCard({ g, fk, onSelect }: { g: Game; fk: string; onSelect?: () => void }) {
  const live = g.state === 'in';
  const team = (t: Game['home']) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-[0.35rem]">
      <div className="h-[3.4rem] w-[3.4rem]"><Art src={t.logo} title={t.abbr || t.name.slice(0, 3)} fit="contain" className="h-full w-full" /></div>
      <div className="clamp-1 w-full text-center text-[0.95rem] font-semibold">{t.name}</div>
    </div>
  );
  return (
    <div className="shrink-0 px-[0.55rem] py-[0.9rem]" style={{ width: '22.6rem' }}>
      <Focusable fk={fk} onSelect={onSelect || (() => nav.go('sports'))} className="f-card flex flex-col rounded-[1rem] bg-gradient-to-br from-ink-600 to-ink-800 p-[1rem]" style={{ width: '21.5rem', height: '11.5rem' }}>
        <div className="flex items-center justify-between text-[0.8rem] font-bold uppercase tracking-wide text-white/60"><span className="clamp-1">{g.league}</span>{live ? <span className="rounded bg-red-600 px-[0.4rem] text-white">LIVE</span> : <span>{g.state === 'post' ? 'FT' : ''}</span>}</div>
        <div className="mt-[0.5rem] flex flex-1 items-center gap-[0.4rem]">
          {team(g.home)}
          <div className="text-center text-[1.9rem] font-black tabular-nums">{g.state === 'pre' ? <span className="text-[1.1rem] text-white/60">vs</span> : `${g.home.score} - ${g.away.score}`}</div>
          {team(g.away)}
        </div>
        <div className="text-center text-[0.85rem] text-accent-cyan">{g.state === 'pre' ? `${fmtDay(g.date)} · ${fmtClock(g.date)}` : g.status}</div>
      </Focusable>
    </div>
  );
}

// "Set me up" call-to-action card used inside rows
export function SetupCard({ icon, title, text, action, onSelect, fk }: { icon: string; title: string; text: string; action: string; onSelect: () => void; fk: string }) {
  return (
    <div className="shrink-0 px-[0.55rem] py-[0.9rem]" style={{ width: '40rem' }}>
      <Focusable fk={fk} onSelect={onSelect} className="f-card flex items-center gap-[1.4rem] rounded-[1rem] border border-white/10 bg-gradient-to-br from-ink-600 to-ink-800 p-[1.4rem]" style={{ width: '39rem', height: '11rem' }}>
        <div className="text-[3.6rem]">{icon}</div>
        <div className="min-w-0"><div className="text-[1.4rem] font-bold">{title}</div><div className="clamp-2 text-[1rem] text-white/60">{text}</div><div className="mt-[0.3rem] text-[1rem] font-bold text-accent-cyan">{action} →</div></div>
      </Focusable>
    </div>
  );
}

export function useWhen<T>(promise: () => Promise<T>, deps: any[] = []) {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => { let on = true; promise().then((r) => on && setV(r)).catch(() => on && setV(null)); return () => { on = false; }; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export function PageScroll({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main data-vscroll="" data-page="" className={`vscroll fade-in relative z-10 flex-1 pb-[6rem] ${className}`}>{children}</main>;
}
