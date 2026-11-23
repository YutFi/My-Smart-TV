import { useEffect, useMemo, useState } from 'react';
import { api, type Episode, type Title } from '../lib/api';
import { localRequest, nav, pid, playMedia, toast, toggleList, useApp, useAsync, useLists } from '../lib/app';
import { Art, Button, Card, EmptyState, Focusable, Loading, Pill, Row } from '../components/ui';
import { ListItemCard, PageScroll, SetupCard, TitleCard } from '../components/content';
import { fmtRuntime } from '../lib/format';
import type { MediaItem } from '../../shared/types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function useTmdbRows(kind: 'movie' | 'tv', rows: { id: string; title: string; which: string }[]) {
  const { profile } = useApp();
  const maxRating = profile?.kids ? 'PG' : profile?.maxRating !== 'all' ? profile?.maxRating : undefined;
  return useAsync(async () => {
    if (!(await api.tmdb.status()).hasKey) return null;
    const res = await Promise.all(rows.map((r) => api.tmdb.list(kind, r.which, { maxRating }).catch(() => [] as Title[])));
    return rows.map((r, i) => ({ ...r, items: res[i] }));
  }, [kind, profile?.id]);
}

export function NoKeyCard() {
  return <Row title="Discover"><SetupCard fk="nokey" icon="🔑" title="Add your free TMDB API key" text="Unlocks posters, trending, ratings, cast, trailers and where-to-watch. Get a key at themoviedb.org → Settings → API." action="Open Settings → Network" onSelect={() => nav.go('settings', { section: 'network' })} /></Row>;
}

export function Movies() {
  const { version } = useLists();
  const rows = useTmdbRows('movie', [
    { id: 'trending', title: 'Trending This Week', which: 'trending' }, { id: 'popular', title: 'Popular Movies', which: 'popular' },
    { id: 'now', title: 'In Theaters', which: 'now_playing' }, { id: 'top', title: 'Top Rated', which: 'top_rated' }, { id: 'up', title: 'Coming Soon', which: 'upcoming' },
  ]);
  const local = useAsync(() => api.library.media({ kind: 'movie', limit: 200 }), []);
  const cont = useAsync(() => api.history.list(pid(), { kinds: ['media'], unfinished: true, limit: 12 }), []);
  const wl = useAsync(() => api.lists.get(pid(), 'watchlist'), [version]);
  const wlMovies = wl.data?.filter((i) => i.kind === 'movie' || (i.kind === 'media' && i.data?.kind === 'movie'));
  return (
    <PageScroll>
      <Header title="Movies" subtitle="Trending, popular and your own collection" />
      {rows.loading && <Loading />}
      {rows.data === null && !rows.loading && <NoKeyCard />}
      {!!cont.data?.length && <Row title="Continue Watching">{cont.data.map((h) => <ListItemCard key={h.ref} it={h} fk={`mcont:${h.ref}`} shape="wide" progress={h.duration ? h.position / h.duration : 0} />)}</Row>}
      {!!wlMovies?.length && <Row title="My Watchlist">{wlMovies.map((it) => <ListItemCard key={it.ref} it={it} fk={`mwl:${it.ref}`} />)}</Row>}
      {rows.data?.map((r, i) => r.items.length > 0 && <Row key={r.id} title={r.title}>{r.items.map((t) => <TitleCard key={t.id} t={t} fk={`m:${r.id}:${t.id}`} shape={i === 0 ? 'wide' : 'poster'} />)}</Row>)}
      {!!local.data?.length && <Row title="Your Movie Library" subtitle={`${local.data.length} movies on this PC`}>{local.data.map((m) => <Card key={m.id} fk={`lm:${m.id}`} title={m.title} sub={m.year ? String(m.year) : ''} image={m.poster} onSelect={async () => playMedia(await localRequest(m))} />)}</Row>}
      {local.data && !local.data.length && rows.data && <Row title="Your Movie Library"><SetupCard fk="lm:setup" icon="💾" title="Add your movie folders" text="MP4, MKV, AVI and more — from this PC, a USB drive or a network share." action="Open My Media" onSelect={() => nav.go('media')} /></Row>}
    </PageScroll>
  );
}

export function Series() {
  const rows = useTmdbRows('tv', [
    { id: 'trending', title: 'Trending This Week', which: 'trending' }, { id: 'popular', title: 'Popular Series', which: 'popular' },
    { id: 'air', title: 'Airing Today', which: 'airing_today' }, { id: 'top', title: 'Top Rated', which: 'top_rated' },
  ]);
  const shows = useAsync(() => api.library.shows(), []);
  const cont = useAsync(() => api.history.list(pid(), { kinds: ['media'], unfinished: true, limit: 24 }), []);
  const eps = cont.data?.filter((h) => h.data?.kind === 'episode');
  return (
    <PageScroll>
      <Header title="TV Series" subtitle="Seasons, episodes and your viewing progress" />
      {rows.loading && <Loading />}
      {rows.data === null && !rows.loading && <NoKeyCard />}
      {!!eps?.length && <Row title="Continue Watching">{eps.map((h) => <ListItemCard key={h.ref} it={h} fk={`scont:${h.ref}`} shape="wide" progress={h.duration ? h.position / h.duration : 0} />)}</Row>}
      {!!shows.data?.length && <Row title="Your Series Library">{shows.data.map((s) => <Card key={s.name} fk={`ls:${s.name}`} title={s.name} sub={`${s.seasons} season${s.seasons > 1 ? 's' : ''} · ${s.episodes} eps`} image={s.poster} onSelect={() => nav.push('show', { name: s.name, tmdbId: s.tmdbId > 0 ? s.tmdbId : 0 })} />)}</Row>}
      {rows.data?.map((r, i) => r.items.length > 0 && <Row key={r.id} title={r.title}>{r.items.map((t) => <TitleCard key={t.id} t={t} fk={`s:${r.id}:${t.id}`} shape={i === 0 ? 'wide' : 'poster'} />)}</Row>)}
      {shows.data && !shows.data.length && rows.data && <Row title="Your Series Library"><SetupCard fk="ls:setup" icon="💾" title="Add your series folders" text="Name files like Show.Name.S01E02.mkv and MY SMART TV groups them into seasons automatically." action="Open My Media" onSelect={() => nav.go('media')} /></Row>}
    </PageScroll>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="px-[3.5rem] pb-[0.6rem] pt-[0.6rem]"><h1 className="text-[2.8rem] font-black tracking-tight">{title}</h1>{subtitle && <div className="text-[1.15rem] text-[color:var(--muted)]">{subtitle}</div>}</div>;
}

// ---------------------- title detail ----------------------
export function TitleDetail({ kind, id }: { kind: 'movie' | 'tv'; id: number }) {
  const { version } = useLists();
  const d = useAsync(() => api.tmdb.detail(kind, id), [kind, id]);
  const local = useAsync(async () => {
    if (!d.data) return [] as MediaItem[];
    const all = await api.library.media({ kind: kind === 'movie' ? 'movie' : 'episode', q: d.data.title, limit: 500 });
    return all.filter((m) => (kind === 'movie' ? norm(m.title) === norm(d.data!.title) : norm(m.show) === norm(d.data!.title)));
  }, [d.data?.id]);
  const wl = useAsync(() => api.lists.get(pid(), 'watchlist'), [version]);
  const inWl = !!wl.data?.some((i) => i.kind === kind && i.ref === String(id));
  const [season, setSeason] = useState(1);
  const eps = useAsync(() => (kind === 'tv' ? api.tmdb.season(id, season) : Promise.resolve([] as Episode[])), [id, season, kind]);
  const [showProv, setShowProv] = useState(false);
  useEffect(() => { if (d.data?.seasons.length && !d.data.seasons.find((s) => s.number === season)) setSeason(d.data.seasons[0].number); }, [d.data, season]);

  if (d.loading) return <PageScroll><Loading /></PageScroll>;
  if (d.error || !d.data) return <PageScroll><EmptyState icon="⚠️" title="Couldn’t load details" message={d.error === 'NO_TMDB_KEY' || /NO_TMDB_KEY/.test(d.error) ? 'Add your TMDB API key in Settings → Network.' : d.error || 'Check your internet connection.'} actions={<Button autoFocus onSelect={() => nav.back()}>Back</Button>} /></PageScroll>;
  const t = d.data;
  const playLocal = async (m: MediaItem) => playMedia(await localRequest(m));
  const firstLocal = local.data?.[0];
  const item = { kind, ref: String(id), title: t.title, image: t.poster, sub: String(t.year) };
  return (
    <PageScroll>
      <div className="relative min-h-[46vh] overflow-hidden">
        {t.backdrop && <img src={t.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--bg0)] via-[color:var(--bg0)]/80 to-[color:var(--bg0)]/20" /><div className="absolute inset-0 bg-gradient-to-t from-[color:var(--bg0)] to-transparent" />
        <div className="relative flex gap-[2.4rem] px-[3.5rem] pb-[1.6rem] pt-[1rem]">
          <div className="hidden h-[26rem] w-[17.4rem] shrink-0 overflow-hidden rounded-[1rem] shadow-2xl md:block"><Art src={t.poster} title={t.title} className="h-full w-full" /></div>
          <div className="max-w-[58rem]">
            <h1 className="text-[3.4rem] font-black leading-tight text-shadow">{t.title}</h1>
            <div className="mt-[0.4rem] flex flex-wrap items-center gap-[0.8rem] text-[1.15rem] text-white/80">
              {t.year > 0 && <span>{t.year}</span>}{t.certification && <span className="rounded border border-white/40 px-[0.4rem] text-[0.95rem]">{t.certification}</span>}{t.runtime > 0 && <span>{fmtRuntime(t.runtime)}</span>}
              {t.rating > 0 && <span className="font-bold text-amber-300">★ {t.rating}</span>}<span className="text-white/50">{t.genreNames.join(' · ')}</span>
            </div>
            {t.tagline && <div className="mt-[0.6rem] text-[1.2rem] italic text-accent-cyan">{t.tagline}</div>}
            <p className="clamp-3 mt-[0.8rem] text-[1.2rem] leading-snug text-white/85">{t.overview}</p>
            <div className="mt-[1.2rem] flex flex-wrap gap-[0.8rem]">
              {kind === 'movie' && firstLocal && <Button primary autoFocus icon="▶" onSelect={() => playLocal(firstLocal)}>Play from my library</Button>}
              {t.trailerKey && <Button primary={!(kind === 'movie' && firstLocal)} autoFocus={!(kind === 'movie' && firstLocal)} icon="🎞" onSelect={async () => { const r = await api.launch.url(`https://www.youtube.com/watch?v=${t.trailerKey}`, { label: 'Trailer' }); if (!r.ok) toast(r.error || 'Could not open trailer', 'error'); }}>Watch trailer</Button>}
              <Button icon="📍" onSelect={() => setShowProv(true)}>Where to watch</Button>
              <Button icon={inWl ? '✓' : '＋'} onSelect={() => toggleList('watchlist', item)}>{inWl ? 'In watchlist' : 'Watchlist'}</Button>
              <Button onSelect={() => nav.back()}>← Back</Button>
            </div>
            {kind === 'movie' && !firstLocal && <div className="mt-[0.8rem] text-[1rem] text-white/45">Not in your library. Use “Where to watch” to find it on your streaming services.</div>}
          </div>
        </div>
      </div>

      {showProv && (
        <Row title="Where to watch">
          {t.providers && (t.providers.flatrate.length + t.providers.rent.length + t.providers.buy.length > 0) ? (
            <div className="px-[0.5rem] py-[0.8rem]"><div className="mb-[0.6rem] text-[1.15rem] text-white/80">
              {t.providers.flatrate.length > 0 && <div>Stream: <b>{t.providers.flatrate.join(', ')}</b></div>}
              {t.providers.rent.length > 0 && <div>Rent: <b>{t.providers.rent.join(', ')}</b></div>}
              {t.providers.buy.length > 0 && <div>Buy: <b>{t.providers.buy.join(', ')}</b></div>}
              <div className="mt-[0.3rem] text-[0.9rem] text-white/40">Availability data by JustWatch via TMDB.</div></div>
              <div className="flex gap-[0.8rem]"><Button autoFocus onSelect={() => nav.go('apps')}>Open Streaming Apps</Button>{t.providers.link && <Button onSelect={() => api.launch.url(t.providers!.link)}>Full list on TMDB</Button>}</div></div>
          ) : <div className="px-[0.5rem] py-[0.8rem] text-[1.15rem] text-white/60">No streaming information for your region.<div className="mt-[0.6rem]"><Button autoFocus onSelect={() => nav.go('apps')}>Open Streaming Apps</Button></div></div>}
        </Row>
      )}

      {kind === 'tv' && (
        <section className="px-[3.5rem] pt-[0.6rem]">
          <div className="mb-[0.8rem] flex flex-wrap gap-[0.6rem]">{t.seasons.map((s) => <Pill key={s.number} fk={`season:${s.number}`} active={s.number === season} onSelect={() => setSeason(s.number)}>{s.name || `Season ${s.number}`}</Pill>)}</div>
          {eps.loading ? <Loading /> : (
            <div className="flex flex-col gap-[0.5rem]">
              {eps.data?.map((e) => {
                const lm = local.data?.find((m) => m.season === season && m.episode === e.number);
                return (
                  <Focusable key={e.number} fk={`ep:${season}:${e.number}`} onSelect={() => (lm ? playLocal(lm) : toast(`S${season}E${e.number} isn’t in your library. Check “Where to watch”.`, 'info', 4000))} className="f-tile flex items-center gap-[1.2rem] p-[0.7rem]">
                    <div className="h-[6.2rem] w-[11rem] shrink-0 overflow-hidden rounded-lg"><Art src={e.still} title={`E${e.number}`} className="h-full w-full" /></div>
                    <div className="min-w-0 flex-1"><div className="clamp-1 text-[1.3rem] font-semibold">{e.number}. {e.name}</div><div className="clamp-2 text-[1rem] text-white/55">{e.overview}</div></div>
                    <div className="shrink-0 pr-[0.8rem] text-right text-[0.95rem] text-white/50">{e.runtime ? `${e.runtime} min` : ''}<div className={lm ? 'font-bold text-emerald-400' : ''}>{lm ? '▶ In library' : ''}</div></div>
                  </Focusable>
                );
              })}
            </div>
          )}
        </section>
      )}

      {t.cast.length > 0 && <Row title="Cast">{t.cast.map((c) => <Card key={c.name} fk={`cast:${c.name}`} shape="square" width={10} title={c.name} sub={c.character} image={c.photo} />)}</Row>}
      {t.recommendations.length > 0 && <Row title="More Like This">{t.recommendations.map((r) => <TitleCard key={r.id} t={r} fk={`rec:${r.id}`} />)}</Row>}
    </PageScroll>
  );
}

// ---------------------- local show (library) ----------------------
export function ShowDetail({ name, tmdbId }: { name: string; tmdbId: number }) {
  const eps = useAsync(() => api.library.media({ show: name, kind: 'episode', limit: 2000 }), [name]);
  const seasons = useMemo(() => [...new Set((eps.data || []).map((e) => e.season))].sort((a, b) => a - b), [eps.data]);
  const [season, setSeason] = useState<number | null>(null);
  const cur = season ?? seasons[0] ?? 1;
  if (eps.loading) return <PageScroll><Loading /></PageScroll>;
  const first = eps.data?.[0];
  return (
    <PageScroll>
      <div className="relative overflow-hidden px-[3.5rem] pb-[1rem] pt-[0.6rem]">
        {first?.backdrop && <img src={first.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="relative"><h1 className="text-[3.2rem] font-black">{name}</h1><p className="clamp-3 mt-[0.4rem] max-w-[60rem] text-[1.15rem] text-white/70">{first?.overview}</p>
          <div className="mt-[1rem] flex gap-[0.8rem]">{eps.data?.[0] && <Button primary autoFocus icon="▶" onSelect={async () => playMedia(await localRequest(eps.data![0]))}>Play from start</Button>}{tmdbId > 0 && <Button onSelect={() => nav.push('title', { kind: 'tv', id: tmdbId })}>Details &amp; cast</Button>}<Button onSelect={() => nav.back()}>← Back</Button></div></div>
      </div>
      <div className="px-[3.5rem]">
        <div className="mb-[0.8rem] flex flex-wrap gap-[0.6rem]">{seasons.map((s) => <Pill key={s} fk={`ls:${s}`} active={s === cur} onSelect={() => setSeason(s)}>{s ? `Season ${s}` : 'Episodes'}</Pill>)}</div>
        <div className="flex flex-col gap-[0.5rem]">
          {eps.data?.filter((e) => e.season === cur).map((e) => (
            <Focusable key={e.id} fk={`lep:${e.id}`} onSelect={async () => playMedia(await localRequest(e))} className="f-tile flex items-center justify-between px-[1.4rem] py-[0.9rem] text-[1.25rem]"><span>E{e.episode} · {e.title}</span><span className="text-[0.95rem] text-white/40">▶</span></Focusable>
          ))}
        </div>
      </div>
    </PageScroll>
  );
}
