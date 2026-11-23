import { useEffect, useMemo, useState } from 'react';
import { api, type Game, type NewsItem } from '../lib/api';
import { updateSettings, useApp, useAsync, toast } from '../lib/app';
import { Art, Button, Card, EmptyState, Focusable, Loading, Modal, Pill, Row } from '../components/ui';
import { GameCard, PageScroll, launchSite } from '../components/content';
import { Header } from './Titles';

export function Sports() {
  const defs = useAsync(() => api.sports.defs(), []);
  const { settings } = useApp();
  const [sportId, setSportId] = useState('football');
  const [leagueId, setLeagueId] = useState('');
  const [game, setGame] = useState<Game | null>(null);
  const [table, setTable] = useState<{ team: string; logo: string; stats: Record<string, string> }[] | null>(null);
  const sport = defs.data?.sports.find((s) => s.id === sportId);
  const league = sport?.leagues.find((l) => l.id === leagueId) || sport?.leagues[0];
  useEffect(() => setLeagueId(''), [sportId]);

  const games = useAsync<Game[] | null>(async () => (league ? await api.sports.scoreboard(league.path, league.name) : []), [league?.path]);
  const news = useAsync<NewsItem[]>(async () => (sport ? await api.sports.news(sport.news).catch(() => []) : []), [sport?.news]);
  const favs = settings.sportsFavorites;

  const groups = useMemo(() => {
    const g = games.data || [];
    return {
      live: g.filter((x) => x.state === 'in'), upcoming: g.filter((x) => x.state === 'pre'), results: g.filter((x) => x.state === 'post').reverse(),
      mine: g.filter((x) => favs.includes(x.home.name) || favs.includes(x.away.name)),
    };
  }, [games.data, favs]);

  if (defs.loading) return <PageScroll><Loading /></PageScroll>;
  const casters = defs.data?.broadcasters[sportId] || [];
  const toggleTeam = (name: string) => { const next = favs.includes(name) ? favs.filter((n) => n !== name) : [...favs, name]; updateSettings({ sportsFavorites: next }); toast(favs.includes(name) ? `Unfollowed ${name}` : `Following ${name}`, 'ok', 2000); };

  return (
    <PageScroll>
      <Header title="Sports" subtitle="Live scores, schedules, standings and where to watch" />
      <div className="flex flex-wrap gap-[0.6rem] px-[3.5rem] pb-[0.5rem]">
        {defs.data?.sports.map((s, i) => <Pill key={s.id} fk={`sport:${s.id}`} autoFocus={i === 0} active={s.id === sportId} onSelect={() => setSportId(s.id)}>{s.icon} {s.name}</Pill>)}
      </div>
      {sport && sport.leagues.length > 1 && (
        <div className="flex flex-wrap gap-[0.5rem] px-[3.5rem] pb-[0.5rem]">
          {sport.leagues.map((l) => <Pill key={l.id} fk={`league:${l.id}`} active={l.id === (league?.id)} onSelect={() => setLeagueId(l.id)}>{l.name}</Pill>)}
          {league && <Button className="!py-[0.45rem] !text-[1.05rem]" onSelect={async () => { try { setTable(await api.sports.standings(league.path)); } catch { toast('Standings aren’t available for this competition.', 'error'); } }}>📊 Standings</Button>}
        </div>
      )}

      {!league ? <EmptyState icon={sport?.icon} title={`${sport?.name} scores aren’t available in-app`} message="There’s no free live-score feed for this sport, but you can read the latest news below and open the official broadcasters." />
        : games.loading ? <Loading label="Loading fixtures…" /> : games.error ? <EmptyState icon="📡" title="Couldn’t load scores" message="Check your internet connection. The score feed may also be temporarily unavailable." actions={<Button autoFocus onSelect={games.reload}>Retry</Button>} /> : (
          <>
            {groups.mine.length > 0 && <Row title="My Teams">{groups.mine.map((g) => <GameCard key={g.id} g={g} fk={`gm:${g.id}`} onSelect={() => setGame(g)} />)}</Row>}
            {groups.live.length > 0 && <Row title="Live Now">{groups.live.map((g) => <GameCard key={g.id} g={g} fk={`gl:${g.id}`} onSelect={() => setGame(g)} />)}</Row>}
            {groups.upcoming.length > 0 && <Row title="Upcoming">{groups.upcoming.map((g) => <GameCard key={g.id} g={g} fk={`gu:${g.id}`} onSelect={() => setGame(g)} />)}</Row>}
            {groups.results.length > 0 && <Row title="Recent Results">{groups.results.map((g) => <GameCard key={g.id} g={g} fk={`gr:${g.id}`} onSelect={() => setGame(g)} />)}</Row>}
            {!games.data?.length && <div className="px-[3.5rem] py-[1.4rem] text-[1.2rem] text-white/55">No fixtures in the next 7 days for {league.name}.</div>}
          </>
        )}

      {casters.length > 0 && <Row title="Where to watch" subtitle="Official broadcasters (subscription may be required)">{casters.map((b) => <Card key={b.name} fk={`bc:${b.name}`} shape="wide" width={17} title={b.name} sub="Open official site" icon="📡" onSelect={() => launchSite(b.url, b.name)} />)}</Row>}
      {news.data && news.data.length > 0 && (
        <Row title="Latest News" subtitle="BBC Sport">
          {news.data.map((n, i) => <Card key={n.link} fk={`news:${i}`} shape="wide" title={n.title} sub={n.desc} image={n.image} onSelect={() => api.launch.url(n.link, { label: 'News' })} />)}
        </Row>
      )}

      {game && (
        <Modal title={`${game.home.name} vs ${game.away.name}`} onClose={() => setGame(null)} width={56}
          footer={<Button autoFocus onSelect={() => setGame(null)}>Close</Button>}>
          <div className="mb-[1rem] flex items-center justify-around text-center">
            {[game.home, game.away].map((t) => <div key={t.id + t.name} className="flex flex-col items-center gap-[0.4rem]"><div className="h-[6rem] w-[6rem]"><Art src={t.logo} title={t.abbr || t.name} fit="contain" className="h-full w-full" /></div><div className="text-[1.3rem] font-bold">{t.name}</div></div>)}
          </div>
          <div className="text-center text-[2.2rem] font-black tabular-nums">{game.state === 'pre' ? new Date(game.date).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : `${game.home.score} – ${game.away.score}`}</div>
          <div className="mb-[1.2rem] text-center text-[1.1rem] text-accent-cyan">{game.status} {game.venue ? `· ${game.venue}` : ''}</div>
          <div className="flex justify-center gap-[0.8rem]">{[game.home, game.away].filter((t) => t.name).map((t) => <Button key={t.name} onSelect={() => toggleTeam(t.name)}>{favs.includes(t.name) ? '★ Following' : '☆ Follow'} {t.abbr || t.name}</Button>)}</div>
        </Modal>
      )}
      {table && (
        <Modal title={`${league?.name} standings`} onClose={() => setTable(null)} width={62} footer={<Button autoFocus onSelect={() => setTable(null)}>Close</Button>}>
          <div className="max-h-[60vh] overflow-y-auto text-[1.1rem]">
            {table.map((r, i) => <div key={r.team} className="flex items-center gap-[0.8rem] border-b border-white/5 py-[0.4rem]"><span className="w-[2rem] text-right text-white/45">{i + 1}</span><div className="h-[2rem] w-[2rem]"><Art src={r.logo} title={r.team} fit="contain" className="h-full w-full" /></div><span className="clamp-1 flex-1">{r.team}</span>{['GP', 'W', 'D', 'L', 'GD', 'P', 'PTS'].filter((k) => r.stats[k] !== undefined).map((k) => <span key={k} className="w-[3.2rem] text-right tabular-nums text-white/60">{k}:{r.stats[k]}</span>)}</div>)}
            {!table.length && <div className="text-white/50">No table available.</div>}
          </div>
        </Modal>
      )}
    </PageScroll>
  );
}

