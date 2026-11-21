import { useState } from 'react';
import { api, type Station } from '../lib/api';
import { localRequest, playMedia, toggleList, useApp, useAsync, pid } from '../lib/app';
import { Card, EmptyState, Loading, Pill, Row } from '../components/ui';
import { PageScroll, launchApp } from '../components/content';
import { Header } from './Titles';

const COUNTRIES = [{ id: 'MY', label: '🇲🇾 Malaysia' }, { id: 'SG', label: '🇸🇬 Singapore' }, { id: 'GB', label: '🇬🇧 UK' }, { id: 'US', label: '🇺🇸 USA' }, { id: 'ID', label: '🇮🇩 Indonesia' }, { id: '', label: '🌍 Worldwide' }];
const GENRES = ['', 'pop', 'rock', 'news', 'jazz', 'classical', 'hiphop', 'dance', 'talk'];

export function Music() {
  const { settings } = useApp();
  const [country, setCountry] = useState(COUNTRIES.find((c) => c.id === settings.region)?.id ?? 'MY');
  const [tag, setTag] = useState('');
  const radio = useAsync<Station[]>(() => api.radio.search({ country, tag }), [country, tag]);
  const local = useAsync(() => api.library.media({ kind: 'music', limit: 500 }), []);
  const recent = useAsync(() => api.history.list(pid(), { kinds: ['station'], limit: 12 }), []);
  const playStation = (s: Station | { name: string; url: string; logo: string; id: string; country?: string; tags?: string }) => playMedia({ type: 'audio', url: s.url, title: s.name, subtitle: `Internet radio${s.country ? ' · ' + s.country : ''}`, image: s.logo, kind: 'station', ref: s.id, isRadio: true, data: { url: s.url } });
  return (
    <PageScroll>
      <Header title="Music" subtitle="Internet radio, your music library and Spotify" />
      <Row title="Listen">
        <Card fk="mu:spotify" shape="logo" title="Spotify" sub="Open the app" icon="🎧" onSelect={() => launchApp('spotify')} />
        <Card fk="mu:yt" shape="logo" title="YouTube Music" sub="Open in browser" icon="🎶" onSelect={() => api.launch.url('https://music.youtube.com/', { label: 'YouTube Music' })} />
      </Row>
      {!!recent.data?.length && <Row title="Recent Stations">{recent.data.map((h) => <Card key={h.ref} fk={`rs:${h.ref}`} shape="square" title={h.title} sub={h.sub} image={h.image} icon="📻" onSelect={() => playMedia({ type: 'audio', url: h.data?.url || h.ref, title: h.title, subtitle: h.sub, image: h.image, kind: 'station', ref: h.ref, isRadio: true, data: h.data })} />)}</Row>}
      {!!local.data?.length && <Row title="My Music" subtitle={`${local.data.length} tracks`}>{local.data.slice(0, 120).map((m) => <Card key={m.id} fk={`lm:${m.id}`} shape="square" title={m.title} sub={m.show} icon="🎵" onSelect={async () => playMedia(await localRequest(m))} />)}</Row>}
      <div className="flex flex-wrap gap-[0.5rem] px-[3.5rem] pt-[0.6rem]">{COUNTRIES.map((c) => <Pill key={c.id || 'all'} fk={`rc:${c.id}`} active={country === c.id} onSelect={() => setCountry(c.id)}>{c.label}</Pill>)}</div>
      <div className="flex flex-wrap gap-[0.5rem] px-[3.5rem] pb-[0.4rem] pt-[0.4rem]">{GENRES.map((g) => <Pill key={g || 'any'} fk={`rg:${g}`} active={tag === g} onSelect={() => setTag(g)}>{g || 'All genres'}</Pill>)}</div>
      {radio.loading ? <Loading label="Finding stations…" /> : radio.error ? <EmptyState icon="📻" title="Couldn’t load radio stations" message="Check your internet connection." /> : (
        <Row title="Internet Radio" subtitle="Free stations from radio-browser.info · press F… or Menu to favorite">
          {radio.data?.map((s) => <Card key={s.id} fk={`st:${s.id}`} shape="square" title={s.name} sub={s.tags.split(',')[0]} image={s.logo} icon={s.logo ? undefined : '📻'} onSelect={() => playStation(s)}
            onKey={(e) => { if (e.k === 'menu' || (e.k === 'char' && e.ch === 'f')) { toggleList('favorites', { kind: 'station', ref: s.id, title: s.name, image: s.logo, sub: s.country, data: { url: s.url } }); return true; } }} />)}
        </Row>
      )}
    </PageScroll>
  );
}
