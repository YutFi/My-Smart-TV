import { fetchJson, fetchBuffer } from './bus';

// Live scores/schedules come from ESPN's public (unofficial, unauthenticated) scoreboard JSON.
// News comes from BBC Sport RSS feeds. Both degrade gracefully when unavailable.

export interface SportDef { id: string; name: string; icon: string; leagues: { id: string; name: string; path: string }[]; news: string }

export const SPORTS: SportDef[] = [
  { id: 'football', name: 'Football', icon: '⚽', news: 'football', leagues: [
    { id: 'eng.1', name: 'Premier League', path: 'soccer/eng.1' },
    { id: 'uefa.champions', name: 'Champions League', path: 'soccer/uefa.champions' },
    { id: 'esp.1', name: 'La Liga', path: 'soccer/esp.1' },
    { id: 'ger.1', name: 'Bundesliga', path: 'soccer/ger.1' },
    { id: 'ita.1', name: 'Serie A', path: 'soccer/ita.1' },
    { id: 'fra.1', name: 'Ligue 1', path: 'soccer/fra.1' },
    { id: 'mys.1', name: 'Malaysia Super League', path: 'soccer/mys.1' },
    { id: 'fifa.world', name: 'FIFA World Cup', path: 'soccer/fifa.world' },
  ] },
  { id: 'basketball', name: 'Basketball', icon: '🏀', news: 'basketball', leagues: [
    { id: 'nba', name: 'NBA', path: 'basketball/nba' },
    { id: 'wnba', name: 'WNBA', path: 'basketball/wnba' },
    { id: 'mens-college-basketball', name: 'NCAA Men', path: 'basketball/mens-college-basketball' },
  ] },
  { id: 'tennis', name: 'Tennis', icon: '🎾', news: 'tennis', leagues: [
    { id: 'atp', name: 'ATP Tour', path: 'tennis/atp' },
    { id: 'wta', name: 'WTA Tour', path: 'tennis/wta' },
  ] },
  { id: 'motorsport', name: 'Motorsport', icon: '🏎️', news: 'formula1', leagues: [
    { id: 'f1', name: 'Formula 1', path: 'racing/f1' },
    { id: 'irl', name: 'IndyCar', path: 'racing/irl' },
  ] },
  { id: 'badminton', name: 'Badminton', icon: '🏸', news: 'badminton', leagues: [] },
  { id: 'cricket', name: 'Cricket', icon: '🏏', news: 'cricket', leagues: [] },
  { id: 'other', name: 'More Sports', icon: '🏆', news: 'sport', leagues: [
    { id: 'nfl', name: 'NFL', path: 'football/nfl' },
    { id: 'mlb', name: 'MLB', path: 'baseball/mlb' },
    { id: 'nhl', name: 'NHL', path: 'hockey/nhl' },
    { id: 'ufc', name: 'UFC', path: 'mma/ufc' },
  ] },
];

export interface Game {
  id: string; league: string; name: string; date: number; state: 'pre' | 'in' | 'post'; status: string;
  home: { name: string; abbr: string; logo: string; score: string; id: string };
  away: { name: string; abbr: string; logo: string; score: string; id: string };
  venue: string;
}

const dayStr = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

export async function scoreboard(path: string, leagueName: string, daysAhead = 5): Promise<Game[]> {
  // ESPN rejects multi-day ranges for some feeds, so request the default slate plus individual days in parallel.
  const base = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
  const urls = [base, ...Array.from({ length: daysAhead + 1 }, (_, i) => `${base}?dates=${dayStr(new Date(Date.now() + (i - 1) * 86400000))}`)];
  const results = await Promise.allSettled(urls.map((u) => fetchJson<any>(u, 12000)));
  const ok = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
  if (!ok.length) throw new Error('Score feed unavailable');
  const seen = new Set<string>();
  const events = ok.flatMap((r) => r.value.events || []).filter((ev: any) => (seen.has(ev.id) ? false : (seen.add(ev.id), true)));
  const j = { events };
  const games: Game[] = [];
  for (const ev of j.events || []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const [a, b] = comp.competitors || [];
    if (!a || !b) {
      games.push({ id: ev.id, league: leagueName, name: ev.name, date: Date.parse(ev.date), state: ev.status?.type?.state || 'pre', status: ev.status?.type?.shortDetail || '', home: { name: ev.name, abbr: '', logo: '', score: '', id: '' }, away: { name: '', abbr: '', logo: '', score: '', id: '' }, venue: comp.venue?.fullName || '' });
      continue;
    }
    const home = comp.competitors.find((c: any) => c.homeAway === 'home') || a;
    const away = comp.competitors.find((c: any) => c.homeAway === 'away') || b;
    const t = (c: any) => ({ name: c.team?.displayName || c.athlete?.displayName || '', abbr: c.team?.abbreviation || '', logo: c.team?.logo || c.athlete?.flag?.href || '', score: c.score ?? '', id: String(c.team?.id || c.athlete?.id || '') });
    games.push({
      id: ev.id, league: leagueName, name: ev.name, date: Date.parse(ev.date), state: ev.status?.type?.state || 'pre',
      status: ev.status?.type?.shortDetail || ev.status?.type?.description || '', home: t(home), away: t(away), venue: comp.venue?.fullName || '',
    });
  }
  return games.sort((x, y) => x.date - y.date);
}

export async function standings(path: string): Promise<{ team: string; logo: string; stats: Record<string, string> }[]> {
  const j = await fetchJson<any>(`https://site.api.espn.com/apis/v2/sports/${path}/standings`, 12000);
  const entries = j.children?.[0]?.standings?.entries || j.standings?.entries || [];
  return entries.slice(0, 25).map((e: any) => ({
    team: e.team?.displayName || '', logo: e.team?.logos?.[0]?.href || '',
    stats: Object.fromEntries((e.stats || []).map((s: any) => [s.abbreviation || s.name, s.displayValue])),
  }));
}

export interface NewsItem { title: string; link: string; desc: string; date: number; image: string }

export async function news(topic: string): Promise<NewsItem[]> {
  const url = `https://feeds.bbci.co.uk/sport/${topic}/rss.xml`;
  const xml = (await fetchBuffer(url, 12000)).toString('utf8');
  const items: NewsItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g; let m: RegExpExecArray | null;
  const tag = (s: string, t: string) => (new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(s)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  while ((m = re.exec(xml)) && items.length < 20) {
    items.push({ title: tag(m[1], 'title'), link: tag(m[1], 'link'), desc: tag(m[1], 'description'), date: Date.parse(tag(m[1], 'pubDate')) || 0, image: /<media:thumbnail[^>]*url="([^"]+)"/.exec(m[1])?.[1] || '' });
  }
  return items;
}

// Official broadcaster / streaming shortcuts. These open the broadcaster's own website; subscriptions are required where applicable.
export const BROADCASTERS: Record<string, { name: string; url: string }[]> = {
  football: [
    { name: 'Astro SuperSport', url: 'https://www.astro.com.my/sports' }, { name: 'beIN SPORTS', url: 'https://www.beinsports.com/' },
    { name: 'Premier League', url: 'https://www.premierleague.com/' }, { name: 'UEFA.tv', url: 'https://www.uefa.tv/' }, { name: 'Sooka', url: 'https://www.sooka.my/' },
  ],
  basketball: [{ name: 'NBA League Pass', url: 'https://www.nba.com/watch' }, { name: 'ESPN', url: 'https://www.espn.com/watch/' }],
  tennis: [{ name: 'Tennis TV', url: 'https://www.tennistv.com/' }, { name: 'WTA', url: 'https://www.wtatennis.com/' }],
  motorsport: [{ name: 'F1 TV', url: 'https://f1tv.formula1.com/' }, { name: 'Formula1.com', url: 'https://www.formula1.com/' }],
  badminton: [{ name: 'BWF TV (YouTube)', url: 'https://www.youtube.com/@bwftv' }, { name: 'BWF Tournaments', url: 'https://bwfbadminton.com/' }],
  cricket: [{ name: 'ICC.tv', url: 'https://www.icc-cricket.com/' }, { name: 'ESPNcricinfo', url: 'https://www.espncricinfo.com/' }],
  other: [{ name: 'ESPN', url: 'https://www.espn.com/watch/' }, { name: 'DAZN', url: 'https://www.dazn.com/' }, { name: 'Olympics.com', url: 'https://olympics.com/en/' }],
};
