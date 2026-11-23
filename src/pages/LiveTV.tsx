import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { channelRequest, currentProfile, nav, pid, playMedia, toast, toggleList, useApp, useAsync, useLists } from '../lib/app';
import { Art, Button, EmptyState, Focusable, Loading, Pill } from '../components/ui';
import { AddPlaylistButtons, PlaylistManager } from '../components/PlaylistManager';
import { TextField } from '../components/osk';
import { PageScroll } from '../components/content';
import { fmtClock, fmtDay } from '../lib/format';
import { CATEGORIES, type Channel, type Profile, type Programme } from '../../shared/types';

const KIDS_OK = new Set(['Kids', 'Educational', 'Documentary', 'Music', 'Lifestyle']);
export function allowedChannel(c: Channel, p: Profile | null) {
  if (!p) return true;
  if (p.blockedCategories.includes(c.category)) return false;
  if (p.kids && !KIDS_OK.has(c.category)) return false;
  return true;
}

type View = 'channels' | 'guide' | 'playlists';

export function LiveTV() {
  const { profile } = useApp();
  const pls = useAsync(() => api.playlists.list(), []);
  const [view, setView] = useState<View>('channels');
  if (pls.loading) return <PageScroll><Loading /></PageScroll>;
  if (!pls.data?.length) {
    return (
      <PageScroll>
        <EmptyState icon="📺" title="Set up Live TV" message="Import a playlist of channels you’re entitled to watch (M3U / M3U8 over a URL, from a file, a USB drive or your network). Add an XMLTV address for the full TV guide. MY SMART TV doesn’t include any channels itself."
          actions={<AddPlaylistButtons autoFocusFirst onDone={pls.reload} />} />
      </PageScroll>
    );
  }
  return (
    <PageScroll>
      <div className="flex items-center gap-[0.8rem] px-[3.5rem] pb-[0.6rem] pt-[0.4rem]">
        <Pill fk="lv:channels" active={view === 'channels'} onSelect={() => setView('channels')} autoFocus>📺 Channels</Pill>
        <Pill fk="lv:guide" active={view === 'guide'} onSelect={() => setView('guide')}>📅 TV Guide</Pill>
        <Pill fk="lv:playlists" active={view === 'playlists'} onSelect={() => setView('playlists')}>📂 Playlists</Pill>
      </div>
      {view === 'playlists' ? <div className="px-[3.5rem]"><PlaylistManager /></div> : <ChannelBrowser key={profile?.id} guide={view === 'guide'} />}
    </PageScroll>
  );
}

function useChannels() {
  const { profile } = useApp();
  const st = useAsync(async () => {
    const [chans, cats] = await Promise.all([api.channels.list({ limit: 12000 }), api.channels.categories()]);
    return { chans: chans.filter((c) => allowedChannel(c, profile)), cats };
  }, [profile?.id]);
  useEffect(() => api.on('iptv:progress', (p) => { if (p?.state === 'done') st.reload(); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

function ChannelBrowser({ guide }: { guide: boolean }) {
  const { data, loading } = useChannels();
  const { fav, version } = useLists();
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const recent = useAsync(() => api.history.list(pid(), { kinds: ['channel'], limit: 30 }), []);

  // Malaysia TV / Singapore TV are country filters; every other category is a genre.
  const inCat = (c: Channel, name: string) => (name === 'Malaysia TV' ? c.country === 'MY' || c.category === name : name === 'Singapore TV' ? c.country === 'SG' || c.category === name : c.category === name);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.chans || []) {
      m.set(c.category, (m.get(c.category) || 0) + 1);
      if (c.country === 'MY' && c.category !== 'Malaysia TV') m.set('Malaysia TV', (m.get('Malaysia TV') || 0) + 1);
      if (c.country === 'SG' && c.category !== 'Singapore TV') m.set('Singapore TV', (m.get('Singapore TV') || 0) + 1);
    }
    return m;
  }, [data]);
  const cats = useMemo(() => {
    if (!data) return [];
    const ordered = [...CATEGORIES.filter((c) => counts.has(c)), ...[...counts.keys()].filter((n) => !(CATEGORIES as readonly string[]).includes(n))];
    return ['All', '★ Favorites', '🕘 Recent', ...ordered];
  }, [data, counts]);

  const list = useMemo(() => {
    if (!data) return [];
    let l = data.chans;
    if (cat === '★ Favorites') l = l.filter((c) => fav.has(`channel:${c.id}`));
    else if (cat === '🕘 Recent') { const order = new Map((recent.data || []).map((r, i) => [Number(r.ref), i])); l = l.filter((c) => order.has(c.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!); }
    else if (cat !== 'All') l = l.filter((c) => inCat(c, cat));
    if (q) { const s = q.toLowerCase(); l = l.filter((c) => c.name.toLowerCase().includes(s) || String(c.num) === q); }
    return l;
  }, [data, cat, q, fav, version, recent.data]);

  useEffect(() => setLimit(60), [cat, q, guide]);
  if (loading && !data) return <Loading label="Loading channels…" />;
  const shown = list.slice(0, limit);
  const more = () => setLimit((l) => Math.min(list.length, l + 60));

  return (
    <div className="flex gap-[2rem] px-[3.5rem]">
      <aside className="w-[19rem] shrink-0">
        <TextField label="🔍 Search" value={q} onChange={setQ} placeholder="Channel name or number" />
        <div className="mt-[0.8rem] flex flex-col gap-[0.35rem]">
          {cats.map((c) => (
            <Focusable key={c} fk={`cat:${c}`} onSelect={() => setCat(c)} className={`f-tile flex items-center justify-between px-[1.1rem] py-[0.65rem] text-[1.15rem] ${cat === c ? '!bg-accent-purple/40 !border-accent-purple' : ''}`}>
              <span className="clamp-1">{c}</span>
              <span className="text-[0.9rem] text-white/45">{c === 'All' ? data?.chans.length : counts.get(c) ?? ''}</span>
            </Focusable>
          ))}
        </div>
      </aside>
      <section className="min-w-0 flex-1">
        {list.length === 0 ? (
          <EmptyState icon="🔎" title="No channels here" message={q ? `Nothing matches “${q}”.` : cat === '★ Favorites' ? 'Press ★ on a channel (or the F key while watching) to add favorites.' : 'This category is empty.'} />
        ) : guide ? <Guide channels={shown} all={list} onMore={more} total={list.length} /> : <ChannelList channels={shown} all={list} onMore={more} total={list.length} />}
      </section>
    </div>
  );
}

function ChannelList({ channels, all, onMore, total }: { channels: Channel[]; all: Channel[]; onMore: () => void; total: number }) {
  const { fav } = useLists();
  const [epg, setEpg] = useState<Record<string, { now?: Programme; next?: Programme }>>({});
  const key = channels.map((c) => c.tvgId).join(',');
  useEffect(() => {
    const ids = [...new Set(channels.map((c) => c.tvgId).filter(Boolean))];
    if (ids.length) api.epg.now(ids).then(setEpg).catch(() => undefined);
    const t = setInterval(() => ids.length && api.epg.now(ids).then(setEpg).catch(() => undefined), 60000);
    return () => clearInterval(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-[0.55rem]">
      {channels.map((c, i) => {
        const e = epg[c.tvgId]; const now = e?.now;
        const pct = now ? Math.max(0, Math.min(100, ((Date.now() - now.start) / (now.stop - now.start)) * 100)) : 0;
        const isFav = fav.has(`channel:${c.id}`);
        return (
          <div key={c.id} className="flex items-stretch gap-[0.5rem]">
            <Focusable fk={`ch:${c.id}`} onFocus={() => { if (i >= channels.length - 8 && channels.length < total) onMore(); }}
              onSelect={() => playMedia(channelRequest(c, all))}
              onKey={(ev) => { if (ev.k === 'char' && ev.ch === 'f') { toggleList('favorites', { kind: 'channel', ref: String(c.id), title: c.name, image: c.logo, sub: c.category }); return true; } }}
              className="f-tile flex flex-1 items-center gap-[1.2rem] px-[1.2rem] py-[0.7rem]">
              <span className="w-[3.6rem] text-right text-[1.2rem] tabular-nums text-white/45">{c.num}</span>
              <div className="h-[3.4rem] w-[5.4rem] shrink-0"><Art src={c.logo} title={c.name.slice(0, 3)} fit="contain" className="h-full w-full rounded" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[0.6rem]"><span className="clamp-1 text-[1.3rem] font-semibold">{c.name}</span>{c.broken && <span className="rounded bg-amber-500 px-[0.4rem] text-[0.75rem] font-bold text-black">⚠ OFFLINE</span>}</div>
                {now ? (<><div className="clamp-1 text-[1.05rem] text-accent-cyan">▶ {now.title}</div><div className="mt-[0.2rem] h-[0.25rem] overflow-hidden rounded bg-white/15"><div className="h-full bg-accent-purple" style={{ width: `${pct}%` }} /></div></>) : <div className="clamp-1 text-[1rem] text-white/40">{c.category}{c.group && c.group !== c.category ? ` · ${c.group}` : ''}</div>}
              </div>
              {e?.next && <div className="hidden w-[16rem] shrink-0 text-[0.95rem] text-white/50 xl:block"><div className="text-[0.8rem] uppercase text-white/35">Next · {fmtClock(e.next.start)}</div><div className="clamp-1">{e.next.title}</div></div>}
            </Focusable>
            <Focusable fk={`chfav:${c.id}`} onSelect={() => toggleList('favorites', { kind: 'channel', ref: String(c.id), title: c.name, image: c.logo, sub: c.category })} className="f-tile flex w-[4.4rem] items-center justify-center text-[1.6rem]">{isFav ? '★' : '☆'}</Focusable>
          </div>
        );
      })}
      {channels.length < total && <Button className="self-center" onSelect={onMore}>Show more ({total - channels.length} left)</Button>}
    </div>
  );
}

// ------------------------------- EPG guide -------------------------------
const SLOT_MIN = 30; const SLOT_REM = 13; const SPAN_H = 12; const BACK_MIN = 90;

function Guide({ channels, all, onMore, total }: { channels: Channel[]; all: Channel[]; onMore: () => void; total: number }) {
  const [start] = useState(() => Math.floor((Date.now() - BACK_MIN * 60000) / (SLOT_MIN * 60000)) * SLOT_MIN * 60000);
  const end = start + SPAN_H * 3600_000;
  const [data, setData] = useState<Record<string, Programme[]>>({});
  const [sel, setSel] = useState<{ p?: Programme; c: Channel } | null>(null);
  const hasEpg = useRef(false);
  const ids = useMemo(() => [...new Set(channels.map((c) => c.tvgId).filter(Boolean))], [channels]);
  useEffect(() => { if (ids.length) api.epg.range(ids, start, end).then((r) => { hasEpg.current = Object.keys(r).length > 0; setData(r); }).catch(() => undefined); }, [ids, start, end]);
  const pxPerMs = SLOT_REM / (SLOT_MIN * 60000);
  const slots = Array.from({ length: (SPAN_H * 60) / SLOT_MIN }, (_, i) => start + i * SLOT_MIN * 60000);
  const nowX = (Date.now() - start) * pxPerMs;
  const play = async (c: Channel, p?: Programme) => {
    if (p && p.stop < Date.now()) {
      if (!c.catchup) { toast('Catch-up isn’t available for this channel — your provider doesn’t advertise it.', 'info', 4500); return; }
      const url = await api.epg.catchup(c.id, p.start, p.stop);
      if (!url) { toast('Could not build a catch-up address for this programme.', 'error'); return; }
      playMedia({ type: 'vod', url, title: `${c.name}: ${p.title}`, subtitle: 'Catch-up', image: c.logo, kind: 'catchup', ref: `${c.id}:${p.start}` });
      return;
    }
    playMedia(channelRequest(c, all));
  };
  return (
    <div>
      <div className="mb-[0.8rem] min-h-[5.2rem] rounded-[0.9rem] bg-white/5 px-[1.2rem] py-[0.6rem]">
        {sel ? (<><div className="flex items-baseline gap-[0.8rem]"><span className="text-[1.5rem] font-bold">{sel.p?.title || sel.c.name}</span>{sel.p && <span className="text-[1.05rem] text-accent-cyan">{fmtDay(sel.p.start)} · {fmtClock(sel.p.start)} – {fmtClock(sel.p.stop)}</span>}{sel.p && sel.p.start <= Date.now() && sel.p.stop > Date.now() && <span className="rounded bg-red-600 px-[0.4rem] text-[0.8rem] font-bold">NOW</span>}</div><div className="clamp-2 text-[1.05rem] text-white/65">{sel.p?.desc || `${sel.c.name} · CH ${sel.c.num}`}</div></>) : <div className="text-[1.1rem] text-white/50">Move over a programme to see its details. Press OK to watch.{!ids.length ? ' These channels have no guide IDs — add an XMLTV address in Playlists.' : ''}</div>}
      </div>
      <div data-hscroll="" className="hscroll relative rounded-[0.9rem] border border-white/10 bg-black/20">
        <div className="relative" style={{ width: `${12 + slots.length * SLOT_REM}rem` }}>
          <div className="sticky top-0 z-20 flex h-[2.4rem] border-b border-white/10 bg-[color:var(--bg1)]">
            <div className="sticky left-0 z-30 w-[12rem] shrink-0 bg-[color:var(--bg1)]" />
            {slots.map((s) => <div key={s} className="shrink-0 border-l border-white/10 px-[0.5rem] text-[0.95rem] leading-[2.4rem] text-white/60" style={{ width: `${SLOT_REM}rem` }}>{fmtClock(s)}</div>)}
          </div>
          <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-[0.15rem] bg-red-500/80" style={{ left: `${12 + nowX}rem` }} />
          {channels.map((c, i) => {
            const progs = (c.tvgId && data[c.tvgId]) || [];
            return (
              <div key={c.id} className="flex h-[4.6rem] border-b border-white/5">
                <Focusable fk={`g:${c.id}`} onFocus={() => { setSel({ c }); if (i >= channels.length - 6 && channels.length < total) onMore(); }} onSelect={() => play(c)} className="f-tile sticky left-0 z-20 flex w-[12rem] shrink-0 items-center gap-[0.6rem] !rounded-none !bg-[color:var(--ink8)] px-[0.7rem]">
                  <span className="w-[2.2rem] text-right text-[0.9rem] text-white/40">{c.num}</span>
                  <div className="h-[2.4rem] w-[3.4rem] shrink-0"><Art src={c.logo} title={c.name.slice(0, 2)} fit="contain" className="h-full w-full" /></div>
                  <span className="clamp-1 text-[0.95rem]">{c.name}</span>
                </Focusable>
                <div className="relative flex-1">
                  {progs.length === 0 && <div className="absolute inset-y-[0.2rem] left-0 right-0 flex items-center rounded bg-white/[0.03] px-[1rem] text-[0.95rem] text-white/30">No programme information</div>}
                  {progs.map((p) => {
                    const l = Math.max(0, (p.start - start) * pxPerMs); const w = Math.max(2, (Math.min(p.stop, end) - Math.max(p.start, start)) * pxPerMs - 0.2);
                    const nowOn = p.start <= Date.now() && p.stop > Date.now();
                    return (
                      <Focusable key={p.start} fk={`gp:${c.id}:${p.start}`} onFocus={() => setSel({ p, c })} onSelect={() => play(c, p)}
                        className={`f-tile absolute inset-y-[0.2rem] overflow-hidden !rounded-[0.5rem] px-[0.7rem] py-[0.3rem] ${nowOn ? '!bg-accent-purple/30' : p.stop < Date.now() ? 'opacity-60' : ''}`} style={{ left: `${l}rem`, width: `${w}rem` }}>
                        <div className="clamp-1 text-[1rem] font-semibold">{p.title}</div><div className="clamp-1 text-[0.8rem] text-white/50">{fmtClock(p.start)}{p.stop < Date.now() && c.catchup ? ' · catch-up' : ''}</div>
                      </Focusable>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {channels.length < total && <div className="mt-[1rem] text-center"><Button onSelect={onMore}>Show more channels</Button></div>}
    </div>
  );
}

