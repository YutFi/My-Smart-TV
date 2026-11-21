import { useEffect, useRef, useState } from 'react';
import { api, type Title } from '../lib/api';
import { channelRequest, localRequest, nav, pid, playMedia, useApp, toast } from '../lib/app';
import { Card, Focusable, Loading, Row } from '../components/ui';
import { AppTile, ListItemCard, PageScroll, TitleCard, openListItem } from '../components/content';
import { useKeys } from '../lib/nav';
import { allowedChannel } from './LiveTV';
import { fmtClock } from '../lib/format';
import { STREAMING_APPS, type Channel, type ListItem, type MediaItem } from '../../shared/types';

const KEYS = ['abcdefg', 'hijklmn', 'opqrstu', 'vwxyz12', '3456789', '0 -.&\'⌫'];

interface Results { channels: Channel[]; progs: { channelId: number; channelName: string; title: string; start: number; stop: number }[]; titles: Title[]; media: MediaItem[]; apps: typeof STREAMING_APPS; saved: ListItem[]; }

export function Search() {
  const { profile } = useApp();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const maxRating = profile?.kids ? 'PG' : profile?.maxRating !== 'all' ? profile?.maxRating : undefined;

  useKeys((e) => {
    if (e.ev && e.k === 'char') { setQ((s) => s + e.ch); return true; }
    if (e.ev && e.k === 'space') { setQ((s) => s + ' '); return true; }
    if (e.ev && e.k === 'backspace' && q) { setQ((s) => s.slice(0, -1)); return true; }
    return false;
  });

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setRes(null); return; }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
      const hasKey = (await safe(api.tmdb.status(), { hasKey: false })).hasKey;
      const [channels, progs, titles, media, saved1, saved2] = await Promise.all([
        safe(api.channels.list({ q: text, limit: 30 }), [] as Channel[]), safe(api.epg.search(text), []),
        hasKey ? safe(api.tmdb.search(text, maxRating), [] as Title[]) : Promise.resolve([] as Title[]),
        safe(api.library.media({ q: text, limit: 30 }), [] as MediaItem[]), safe(api.lists.get(pid(), 'favorites'), [] as ListItem[]), safe(api.lists.get(pid(), 'watchlist'), [] as ListItem[]),
      ]);
      if (my !== seq.current) return;
      const s = text.toLowerCase();
      setRes({
        channels: channels.filter((c) => allowedChannel(c, profile)), progs, titles, media,
        apps: STREAMING_APPS.filter((a) => a.name.toLowerCase().includes(s) || a.id.includes(s)),
        saved: [...saved1, ...saved2].filter((i) => i.title.toLowerCase().includes(s)),
      });
      setBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = res ? res.channels.length + res.progs.length + res.titles.length + res.media.length + res.apps.length + res.saved.length : 0;
  const add = (c: string) => setQ((s) => (c === '⌫' ? s.slice(0, -1) : s + c));
  const queueFor = async (c: Channel) => (await api.channels.list({ playlistId: c.playlistId, limit: 12000 })).filter((x) => allowedChannel(x, profile));

  return (
    <PageScroll>
      <div className="flex gap-[2.4rem] px-[3.5rem]">
        <aside className="w-[22rem] shrink-0">
          <div className="mb-[0.8rem] min-h-[3.4rem] rounded-xl border border-white/15 bg-black/40 px-[1rem] py-[0.5rem] text-[1.5rem]">{q || <span className="text-white/35">Search everything…</span>}</div>
          <div className="flex flex-col gap-[0.35rem]">
            {KEYS.map((row, ri) => (
              <div key={ri} className="flex gap-[0.35rem]">
                {row.split('').map((c, ci) => <Focusable key={c + ci} fk={`sk:${c}`} autoFocus={ri === 0 && ci === 0} onSelect={() => add(c)} className="f-key flex h-[2.8rem] flex-1 items-center justify-center text-[1.2rem] font-semibold">{c === ' ' ? '␣' : c}</Focusable>)}
              </div>
            ))}
            <Focusable fk="sk:clear" onSelect={() => setQ('')} className="f-key mt-[0.2rem] flex h-[2.6rem] items-center justify-center text-[1.05rem]">Clear</Focusable>
          </div>
          <p className="mt-[1rem] text-[0.95rem] leading-snug text-white/40">Type with a keyboard or pick letters with the remote. For voice typing on Windows press <b>Win + H</b>.</p>
        </aside>
        <section className="min-w-0 flex-1 -ml-[0.5rem]">
          {!res && !busy && <div className="py-[4rem] text-center text-[1.5rem] text-white/40">Search live channels, TV guide, movies, series, your media, apps and favorites.</div>}
          {busy && !res && <Loading label="Searching…" />}
          {res && total === 0 && !busy && <div className="py-[4rem] text-center text-[1.5rem] text-white/50">No results for “{q}”.</div>}
          {res && (
            <div className="-mx-[3.5rem]">
              {res.channels.length > 0 && <Row title="Live Channels">{res.channels.map((c) => <Card key={c.id} fk={`sc:${c.id}`} shape="logo" title={c.name} sub={`CH ${c.num} · ${c.category}`} image={c.logo} live broken={c.broken} fit="contain" onSelect={async () => playMedia(channelRequest(c, await queueFor(c)))} />)}</Row>}
              {res.progs.length > 0 && <Row title="On TV">{res.progs.map((p, i) => <Card key={i} fk={`sp:${i}`} shape="wide" title={p.title} sub={`${p.channelName} · ${fmtClock(p.start)}`} icon="📺" onSelect={async () => { const [c] = await api.channels.list({ ids: [p.channelId] }); if (c) playMedia(channelRequest(c, [c])); }} />)}</Row>}
              {res.titles.length > 0 && <Row title="Movies & Series">{res.titles.map((t) => <TitleCard key={t.kind + t.id} t={t} fk={`st:${t.kind}${t.id}`} />)}</Row>}
              {res.media.length > 0 && <Row title="My Media">{res.media.map((m) => <Card key={m.id} fk={`sm:${m.id}`} title={m.title} sub={m.kind === 'episode' ? m.show : ''} image={m.poster} icon={m.kind === 'music' ? '🎵' : undefined} onSelect={async () => playMedia(await localRequest(m))} />)}</Row>}
              {res.apps.length > 0 && <Row title="Apps">{res.apps.map((a) => <AppTile key={a.id} app={a} fk={`sa:${a.id}`} />)}</Row>}
              {res.saved.length > 0 && <Row title="In Your Lists">{res.saved.map((it) => <ListItemCard key={it.kind + it.ref} it={it} fk={`ss:${it.kind}${it.ref}`} />)}</Row>}
              <Row title="Search elsewhere">
                <Card fk="se:yt" shape="wide" title={`YouTube: “${q}”`} sub="Opens results" icon="▶️" onSelect={() => api.launch.url(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, { label: 'YouTube' })} />
                {!res.titles.length && <Card fk="se:tmdb" shape="wide" title="Add TMDB key for movie search" sub="Settings → Network" icon="🔑" onSelect={() => nav.go('settings', { section: 'network' })} />}
              </Row>
            </div>
          )}
        </section>
      </div>
    </PageScroll>
  );
}

