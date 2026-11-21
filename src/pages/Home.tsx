import { useEffect, useMemo, useState } from 'react';
import { api, type Game, type Title } from '../lib/api';
import { nav, pid, useApp, useAsync, useLists, ratingAllowed, localRequest, playMedia, channelRequest, toast } from '../lib/app';
import { Card, Row } from '../components/ui';
import { Hero, type HeroSlide } from '../components/Hero';
import { AppTile, GameCard, ListItemCard, PageScroll, SiteTile, SetupCard, TitleCard, launchApp, openListItem, openTitle } from '../components/content';
import { STREAMING_APPS, type ListItem } from '../../shared/types';

function useTitles(kind: 'movie' | 'tv', which: string, maxRating?: string) {
  const { data } = useAsync(async () => ((await api.tmdb.status()).hasKey ? await api.tmdb.list(kind, which, { maxRating }) : null), [kind, which, maxRating]);
  return data;
}

export function Home() {
  const { settings, profile } = useApp();
  const maxRating = profile?.kids ? 'PG' : ratingAllowed(profile);
  const trending = useTitles('movie', 'trending', maxRating);
  const cont = useAsync(() => api.history.list(pid(), { kinds: ['media'], unfinished: true, limit: 20 }), []);
  const kids = !!profile?.kids;

  const slides: HeroSlide[] = useMemo(() => {
    const out: HeroSlide[] = [];
    const c = cont.data?.[0];
    if (c) out.push({ id: `c${c.ref}`, title: c.title, overview: c.sub ? `Continue watching ${c.sub}` : 'Pick up right where you left off.', backdrop: c.image, tag: 'Continue watching', meta: c.duration ? `${Math.round((c.position / c.duration) * 100)}% watched` : '', actions: [{ label: 'Resume', icon: '▶', primary: true, onSelect: () => openListItem(c) }, { label: 'More like this', onSelect: () => nav.go('media') }] });
    (trending || []).slice(0, 5).forEach((t) => out.push({ id: `t${t.id}`, title: t.title, overview: t.overview, backdrop: t.backdrop, tag: 'Trending this week', meta: `${t.year}${t.rating ? ` · ★ ${t.rating}` : ''}`, actions: [{ label: 'Details', icon: 'ℹ', primary: true, onSelect: () => openTitle(t) }, { label: 'Find where to watch', onSelect: () => openTitle(t) }] }));
    if (out.length === 0) {
      out.push({ id: 'w1', title: 'Welcome to MY SMART TV', tag: 'Get started', overview: 'Your PC is now a Smart TV box. Add an IPTV playlist for live channels, point the media library at your movies, or open your streaming apps.', actions: [{ label: 'Add live TV', icon: '📺', primary: true, onSelect: () => nav.go('live') }, { label: 'Streaming apps', icon: '🧩', onSelect: () => nav.go('apps') }] });
      out.push({ id: 'w2', title: 'Movie & series discovery', tag: 'Tip', overview: 'Add a free TMDB key in Settings → Network to unlock posters, trending lists, cast, trailers and “where to watch”.', actions: [{ label: 'Open settings', icon: '⚙️', primary: true, onSelect: () => nav.go('settings') }] });
    }
    return out;
  }, [cont.data, trending]);

  const rows = settings.homeRows.filter((r) => !(kids && ['sports', 'apps', 'youtube'].includes(r)));
  return (
    <PageScroll>
      <Hero slides={slides} />
      <div>
        {rows.map((id) => <HomeRow key={id} id={id} trending={trending} />)}
      </div>
    </PageScroll>
  );
}

function HomeRow({ id, trending }: { id: string; trending: Title[] | null }) {
  switch (id) {
    case 'continue': return <ContinueRow />;
    case 'live': return <LiveRow />;
    case 'trending': return <TrendingRow data={trending} />;
    case 'series': return <SeriesRow />;
    case 'sports': return <SportsRow />;
    case 'apps': return <AppsRow />;
    case 'youtube': return <YoutubeRow />;
    case 'music': return <MusicRow />;
    case 'media': return <MediaRow />;
    case 'favorites': return <ListRow list="favorites" title="Favorites" />;
    case 'watchlist': return <ListRow list="watchlist" title="Watchlist" />;
    case 'recent': return <RecentRow />;
    case 'recommended': return <RecommendedRow />;
    default: return null;
  }
}

function ContinueRow() {
  const { data } = useAsync(() => api.history.list(pid(), { kinds: ['media'], unfinished: true, limit: 20 }), []);
  if (!data?.length) return null;
  return <Row title="Continue Watching">{data.map((h) => <ListItemCard key={h.ref} it={h} fk={`cont:${h.ref}`} shape="wide" progress={h.duration ? h.position / h.duration : 0} />)}</Row>;
}

function LiveRow() {
  const { version } = useLists();
  const pl = useAsync(() => api.playlists.list(), []);
  const { data } = useAsync(async () => {
    const favs = await api.lists.get(pid(), 'favorites', 'channel');
    const rec = await api.history.list(pid(), { kinds: ['channel'], limit: 12 });
    const ids = [...favs.map((f) => Number(f.ref)), ...rec.map((r) => Number(r.ref))].filter((v, i, a) => a.indexOf(v) === i).slice(0, 24);
    let chans = ids.length ? await api.channels.list({ ids }) : [];
    const all = await api.channels.list({ limit: 4000 });
    if (!chans.length) chans = all.slice(0, 20);
    return { chans, all };
  }, [version]);
  if (pl.loading) return null;
  if (!pl.data?.length) return <Row title="Live TV"><SetupCard fk="live:setup" icon="📺" title="Add your IPTV playlist" text="Import an M3U/M3U8 playlist (URL, file or USB) to get channels, logos and a TV guide." action="Set up Live TV" onSelect={() => nav.go('live')} /></Row>;
  if (!data?.chans.length) return null;
  return (
    <Row title="Live TV" subtitle="Favorites & recently watched">
      {data.chans.map((c) => <Card key={c.id} fk={`live:${c.id}`} shape="logo" title={c.name} sub={`CH ${c.num}`} image={c.logo} live broken={c.broken} fit="contain" onSelect={() => playMedia(channelRequest(c, data.all))} />)}
    </Row>
  );
}

function TrendingRow({ data }: { data: Title[] | null }) {
  const st = useAsync(() => api.tmdb.status(), []);
  const local = useAsync(() => api.library.media({ kind: 'movie', limit: 30 }), []);
  if (st.data && !st.data.hasKey) {
    return (
      <Row title="Trending Movies">
        {local.data?.slice(0, 15).map((m) => <Card key={m.id} fk={`mov:${m.id}`} title={m.title} sub={m.year ? String(m.year) : 'Local'} image={m.poster} onSelect={async () => playMedia(await localRequest(m))} />)}
        <SetupCard fk="mov:setup" icon="🎞️" title="Unlock trending & recommendations" text="Add your free TMDB API key to see posters, ratings, trailers and where to watch." action="Open Settings" onSelect={() => nav.go('settings')} />
      </Row>
    );
  }
  if (!data?.length) return null;
  return <Row title="Trending Movies">{data.map((t) => <TitleCard key={t.id} t={t} fk={`trend:${t.id}`} />)}</Row>;
}

function SeriesRow() {
  const { profile } = useApp();
  const { data } = useAsync(async () => ((await api.tmdb.status()).hasKey ? await api.tmdb.list('tv', 'popular', { maxRating: profile?.kids ? 'PG' : undefined }) : null), [profile?.id]);
  if (!data?.length) return null;
  return <Row title="Popular TV Series">{data.map((t) => <TitleCard key={t.id} t={t} fk={`series:${t.id}`} />)}</Row>;
}

function SportsRow() {
  const { data } = useAsync(async () => {
    const defs = await api.sports.defs();
    const picks = [defs.sports[0].leagues[0], defs.sports[1].leagues[0], defs.sports[3].leagues[0]].filter(Boolean);
    const lists = await Promise.all(picks.map((l) => api.sports.scoreboard(l.path, l.name).catch(() => [] as Game[])));
    const now = Date.now();
    return lists.flat().filter((g) => g.state === 'in' || (g.date > now - 3 * 3600_000 && g.date < now + 3 * 86400_000)).sort((a, b) => (a.state === 'in' ? -1 : 0) - (b.state === 'in' ? -1 : 0) || a.date - b.date).slice(0, 14);
  }, []);
  if (!data?.length) return null;
  return <Row title="Sports" subtitle="Live now & upcoming">{data.map((g) => <GameCard key={g.id} g={g} fk={`sp:${g.id}`} />)}</Row>;
}

// Apps and websites together: recently opened first, then your own websites, then the built-in services.
function AppsRow() {
  const { data } = useAsync(async () => ({ recents: await api.launch.recents(pid()), sites: await api.lists.get(pid(), 'sites') }), []);
  type Entry = { key: string; app?: (typeof STREAMING_APPS)[number]; site?: ListItem };
  const entries: Entry[] = [];
  const seen = new Set<string>();
  const push = (e: Entry) => { if (!seen.has(e.key)) { seen.add(e.key); entries.push(e); } };
  const siteByRef = new Map((data?.sites || []).map((s) => [`site:${s.ref}`, s]));
  for (const id of data?.recents || []) { const a = STREAMING_APPS.find((x) => x.id === id); if (a) push({ key: a.id, app: a }); else if (siteByRef.has(id)) push({ key: id, site: siteByRef.get(id) }); }
  for (const s of data?.sites || []) push({ key: `site:${s.ref}`, site: s });
  for (const a of STREAMING_APPS) push({ key: a.id, app: a });
  return (
    <Row title="Apps & Websites" subtitle={data?.recents.length ? 'Recently opened first' : data?.sites.length ? 'Including your websites' : undefined}>
      {entries.map((e) => (e.app ? <AppTile key={e.key} app={e.app} fk={`app:${e.key}`} /> : <SiteTile key={e.key} it={e.site!} fk={`app:${e.key}`} />))}
      <SetupCard fk="app:add" icon="＋" title="Add a website" text="Put any streaming site or web app on your Home screen." action="Open Apps" onSelect={() => nav.go('apps')} />
    </Row>
  );
}

function YoutubeRow() {
  const { data } = useAsync(() => api.history.list(pid(), { kinds: ['youtube'], limit: 10 }), []);
  return (
    <Row title="YouTube">
      <Card fk="yt:open" shape="wide" title="Open YouTube" sub="Full screen" icon="▶️" onSelect={() => launchApp('youtube')} />
      <Card fk="yt:page" shape="wide" title="Search & trending" sub="Browse inside MY SMART TV" icon="🔍" onSelect={() => nav.go('youtube')} />
      {data?.map((h) => <ListItemCard key={h.ref} it={h} fk={`yt:${h.ref}`} shape="wide" />)}
    </Row>
  );
}

function MusicRow() {
  const { data } = useAsync(() => api.library.media({ kind: 'music', limit: 14 }), []);
  return (
    <Row title="Music">
      <Card fk="mu:radio" shape="square" title="Internet Radio" sub="Free stations" icon="📻" onSelect={() => nav.go('music')} />
      <Card fk="mu:spot" shape="square" title="Spotify" sub="Open app" icon="🎧" onSelect={() => launchApp('spotify')} />
      {data?.map((m) => <Card key={m.id} fk={`mu:${m.id}`} shape="square" title={m.title} sub={m.show} icon="🎵" onSelect={async () => playMedia(await localRequest(m))} />)}
    </Row>
  );
}

function MediaRow() {
  const [n, setN] = useState<number | null>(null);
  const folders = useAsync(() => api.library.folders(), []);
  const { data } = useAsync(() => api.library.media({ limit: 24 }), []);
  useEffect(() => setN(folders.data ? folders.data.length : null), [folders.data]);
  if (n === 0) return <Row title="My Media"><SetupCard fk="media:setup" icon="💾" title="Add your personal media" text="Choose folders on this PC, a USB drive or a network share." action="Add a folder" onSelect={() => nav.go('media')} /></Row>;
  const items = (data || []).filter((m) => m.kind !== 'music');
  if (!items.length) return null;
  return <Row title="My Media">{items.slice(0, 20).map((m) => <Card key={m.id} fk={`media:${m.id}`} title={m.title} sub={m.kind === 'episode' ? m.show : m.year ? String(m.year) : ''} image={m.poster} onSelect={async () => playMedia(await localRequest(m))} />)}</Row>;
}

function ListRow({ list, title }: { list: 'favorites' | 'watchlist'; title: string }) {
  const { version } = useLists();
  const { data } = useAsync(() => api.lists.get(pid(), list), [version]);
  if (!data?.length) return null;
  return <Row title={title}>{data.slice(0, 24).map((it) => <ListItemCard key={`${it.kind}${it.ref}`} it={it} fk={`${list}:${it.kind}:${it.ref}`} />)}</Row>;
}

function RecentRow() {
  const { data } = useAsync(() => api.history.list(pid(), { kinds: ['media', 'youtube', 'station'], limit: 16 }), []);
  if (!data?.length) return null;
  return <Row title="Recently Watched">{data.map((h) => <ListItemCard key={h.kind + h.ref} it={h} fk={`rec:${h.kind}:${h.ref}`} shape={h.kind === 'media' ? 'poster' : undefined} />)}</Row>;
}

function RecommendedRow() {
  const { profile } = useApp();
  const { data } = useAsync(async () => {
    if (!(await api.tmdb.status()).hasKey) return null;
    const wl = (await api.lists.get(pid(), 'watchlist')).find((i) => i.kind === 'movie' || i.kind === 'tv');
    if (wl) { const d = await api.tmdb.detail(wl.kind as 'movie' | 'tv', Number(wl.ref)); if (d.recommendations.length) return { title: `Because you saved “${wl.title}”`, items: d.recommendations }; }
    return { title: 'Top Rated', items: await api.tmdb.list('movie', 'top_rated', { maxRating: profile?.kids ? 'PG' : undefined }) };
  }, [profile?.id]);
  if (!data?.items.length) return null;
  return <Row title="Recommended for You" subtitle={data.title}>{data.items.map((t) => <TitleCard key={t.id} t={t} fk={`reco:${t.id}`} />)}</Row>;
}

