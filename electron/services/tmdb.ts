import { loadSettings } from '../db';
import { unseal } from './security';
import { fetchJson } from './bus';

// TMDB (themoviedb.org) — requires the user's own free API key (Settings → Network).
// "This product uses the TMDB API but is not endorsed or certified by TMDB."
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

const cache = new Map<string, { t: number; v: any }>();

function key(): string {
  return unseal(loadSettings().tmdbKey as unknown as string);
}

export function hasKey() { return !!key(); }

async function call(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const k = key();
  if (!k) throw new Error('NO_TMDB_KEY');
  const lang = ({ en: 'en-US', ms: 'ms-MY', zh: 'zh-CN', ta: 'ta-IN' } as Record<string, string>)[loadSettings().language] || 'en-US';
  const qs = new URLSearchParams({ language: lang, ...Object.fromEntries(Object.entries(params).map(([a, b]) => [a, String(b)])) });
  const headers: Record<string, string> = {};
  // v4 read tokens are JWTs (start with "eyJ"); v3 keys are 32 hex chars.
  if (k.startsWith('eyJ')) headers.Authorization = `Bearer ${k}`; else qs.set('api_key', k);
  const url = `${BASE}${path}?${qs}`;
  const ck = url.replace(/api_key=[^&]+/, '');
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < 30 * 60_000) return hit.v;
  const v = await fetchJson(url, 15000, headers);
  cache.set(ck, { t: Date.now(), v });
  return v;
}

export interface Title {
  id: number; kind: 'movie' | 'tv'; title: string; year: number; overview: string;
  poster: string; backdrop: string; rating: number; genres: number[];
}

const map = (kind: 'movie' | 'tv') => (r: any): Title => ({
  id: r.id, kind: (r.media_type as any) === 'tv' || (r.media_type as any) === 'movie' ? r.media_type : kind,
  title: r.title || r.name || '', year: parseInt((r.release_date || r.first_air_date || '0').slice(0, 4), 10) || 0,
  overview: r.overview || '', poster: r.poster_path ? `${IMG}/w500${r.poster_path}` : '',
  backdrop: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : '', rating: Math.round((r.vote_average || 0) * 10) / 10,
  genres: r.genre_ids || [],
});

const ALLOWED_RATINGS: Record<string, string> = { G: 'G', PG: 'PG', 'PG-13': 'PG-13', R: 'R' };

export async function list(kind: 'movie' | 'tv', which: string, opts: { maxRating?: string; genre?: number } = {}): Promise<Title[]> {
  const region = loadSettings().region || 'US';
  let path = ''; const p: Record<string, string | number> = { region };
  if (which === 'trending') path = `/trending/${kind}/week`;
  else if (which === 'popular') path = `/${kind}/popular`;
  else if (which === 'top_rated') path = `/${kind}/top_rated`;
  else if (which === 'now_playing') path = '/movie/now_playing';
  else if (which === 'upcoming') path = '/movie/upcoming';
  else if (which === 'airing_today') path = '/tv/airing_today';
  else if (which === 'on_the_air') path = '/tv/on_the_air';
  else if (which === 'discover') { path = `/discover/${kind}`; p.sort_by = 'popularity.desc'; if (opts.genre) p.with_genres = opts.genre; }
  else throw new Error('Unknown list ' + which);
  p.include_adult = 'false';
  if (opts.maxRating && ALLOWED_RATINGS[opts.maxRating] && kind === 'movie') {
    path = '/discover/movie'; p.certification_country = 'US'; p['certification.lte'] = opts.maxRating; p.sort_by = 'popularity.desc';
  }
  if (opts.maxRating && opts.maxRating !== 'all' && kind === 'tv') { path = '/discover/tv'; p.with_genres = '16,10751'; p.sort_by = 'popularity.desc'; }
  const r = await call(path, p);
  return (r.results || []).filter((x: any) => x.poster_path || x.backdrop_path).map(map(kind));
}

export async function search(q: string, maxRating?: string): Promise<Title[]> {
  const r = await call('/search/multi', { query: q, include_adult: 'false' });
  let res = (r.results || []).filter((x: any) => x.media_type === 'movie' || x.media_type === 'tv').map((x: any) => map(x.media_type)(x));
  if (maxRating && maxRating !== 'all') res = res.filter((x: Title) => !x.genres.includes(27) && !x.genres.includes(53)); // hide horror/thriller for restricted profiles
  return res;
}

export async function detail(kind: 'movie' | 'tv', id: number) {
  const r = await call(`/${kind}/${id}`, { append_to_response: 'credits,videos,watch/providers,recommendations,content_ratings,release_dates' });
  const region = loadSettings().region || 'US';
  const trailer = (r.videos?.results || []).find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') || (r.videos?.results || []).find((v: any) => v.site === 'YouTube');
  const prov = r['watch/providers']?.results?.[region] || r['watch/providers']?.results?.US || null;
  return {
    ...map(kind)(r),
    genreNames: (r.genres || []).map((g: any) => g.name),
    runtime: r.runtime || (r.episode_run_time?.[0] ?? 0),
    tagline: r.tagline || '',
    cast: (r.credits?.cast || []).slice(0, 12).map((c: any) => ({ name: c.name, character: c.character, photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : '' })),
    trailerKey: trailer?.key || '',
    seasons: (r.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => ({ number: s.season_number, name: s.name, episodes: s.episode_count, poster: s.poster_path ? `${IMG}/w342${s.poster_path}` : '' })),
    providers: prov ? { link: prov.link || '', flatrate: (prov.flatrate || []).map((p: any) => p.provider_name), rent: (prov.rent || []).map((p: any) => p.provider_name), buy: (prov.buy || []).map((p: any) => p.provider_name) } : null,
    recommendations: (r.recommendations?.results || []).filter((x: any) => x.poster_path).map(map(kind)),
    certification: pickCertification(r, kind, region),
  };
}

function pickCertification(r: any, kind: string, region: string): string {
  if (kind === 'movie') {
    const e = (r.release_dates?.results || []).find((x: any) => x.iso_3166_1 === region) || (r.release_dates?.results || []).find((x: any) => x.iso_3166_1 === 'US');
    return e?.release_dates?.find((d: any) => d.certification)?.certification || '';
  }
  const e = (r.content_ratings?.results || []).find((x: any) => x.iso_3166_1 === region) || (r.content_ratings?.results || []).find((x: any) => x.iso_3166_1 === 'US');
  return e?.rating || '';
}

export async function season(id: number, n: number) {
  const r = await call(`/tv/${id}/season/${n}`);
  return (r.episodes || []).map((e: any) => ({
    number: e.episode_number, name: e.name, overview: e.overview || '', runtime: e.runtime || 0, airDate: e.air_date || '',
    still: e.still_path ? `${IMG}/w500${e.still_path}` : '',
  }));
}

export async function findByName(name: string, year: number, kind: 'movie' | 'tv'): Promise<Title | null> {
  try {
    const r = await call(`/search/${kind}`, { query: name, ...(year ? (kind === 'movie' ? { year } : { first_air_date_year: year }) : {}) });
    const x = (r.results || [])[0];
    return x ? map(kind)(x) : null;
  } catch { return null; }
}

export const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10765: 'Sci-Fi & Fantasy',
};
