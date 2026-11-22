import { useState } from 'react';
import { api, type YtVideo } from '../lib/api';
import { nav, pid, toast, useApp, useAsync } from '../lib/app';
import { Button, Card, EmptyState, Loading, Row } from '../components/ui';
import { TextField } from '../components/osk';
import { ListItemCard, PageScroll, openYoutubeVideo } from '../components/content';
import { Header } from './Titles';
import { launchWithSplash } from '../lib/splash';

async function openYt(url: string, tv = false) {
  const r = await launchWithSplash({ title: 'YouTube', text: 'YouTube', color: '#ff0033', color2: '#8a0019' }, () => api.launch.url(url, { tv, label: 'YouTube' }));
  if (r.error === 'cancelled') return;
  if (!r.ok) toast(r.error || 'Could not open YouTube', 'error');
  else toast('Opening YouTube… press Ctrl+Alt+H or the remote’s Home key to return', 'info', 5000);
}

export function YouTube() {
  const { settings, profile } = useApp();
  const hasKey = !!settings.youtubeKey;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<YtVideo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const trending = useAsync<YtVideo[] | null>(async () => (hasKey ? await api.youtube.trending() : null), [hasKey]);
  const recent = useAsync(() => api.history.list(pid(), { kinds: ['youtube'], limit: 20 }), []);

  const search = async (text: string) => {
    setQ(text);
    if (!text.trim()) return;
    if (!hasKey) { openYt(`https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`); return; }
    setBusy(true);
    try { setResults(await api.youtube.search(text)); } catch (e: any) { toast(e.message === 'NO_YT_KEY' ? 'Add a YouTube API key in Settings → Network.' : 'Search failed: ' + e.message, 'error', 5000); }
    setBusy(false);
  };

  if (profile?.kids) return <PageScroll><EmptyState icon="🔒" title="YouTube is turned off for kids profiles" message="Switch to a regular profile to use YouTube." /></PageScroll>;

  return (
    <PageScroll>
      <Header title="YouTube & Video" subtitle="Browse, search and watch full screen" />
      <div className="flex flex-wrap items-start gap-[1rem] px-[3.5rem] pb-[0.8rem]">
        <Button primary autoFocus icon="▶" onSelect={() => openYt('https://www.youtube.com/')}>Open YouTube</Button>
        <Button icon="📺" onSelect={() => openYt('https://www.youtube.com/tv', true)}>YouTube TV interface</Button>
        <div className="w-[38rem]"><TextField label="🔍 Search YouTube" value={q} onChange={search} placeholder="Type, then press Done" /></div>
      </div>
      {!hasKey && <div className="mx-[3.5rem] mb-[0.8rem] rounded-xl bg-white/5 px-[1.2rem] py-[0.8rem] text-[1.05rem] text-white/60">Searching opens YouTube’s own results page. Add a free YouTube Data API key in <b>Settings → Network</b> to browse results inside MY SMART TV with thumbnails.</div>}
      {busy && <Loading label="Searching…" />}
      {results && <Row title={`Results for “${q}”`}>{results.map((v) => <Card key={v.id} shape="wide" fk={`ytr:${v.id}`} title={v.title} sub={v.channel} image={v.thumb} onSelect={() => openYoutubeVideo(v)} />)}</Row>}
      {trending.data && <Row title="Trending">{trending.data.map((v) => <Card key={v.id} shape="wide" fk={`ytt:${v.id}`} title={v.title} sub={v.channel} image={v.thumb} onSelect={() => openYoutubeVideo(v)} />)}</Row>}
      {!!recent.data?.length && <Row title="Recently Opened">{recent.data.map((h) => <ListItemCard key={h.ref} it={h} fk={`ytrec:${h.ref}`} shape="wide" />)}</Row>}
      <Row title="More video services">
        <Card shape="wide" fk="vs:twitch" title="Twitch" sub="Live streams" icon="🎮" onSelect={() => api.launch.app(pid(), 'twitch')} />
        <Card shape="wide" fk="vs:apps" title="All streaming apps" sub="Netflix, Disney+, Prime…" icon="🧩" onSelect={() => nav.go('apps')} />
        <Card shape="wide" fk="vs:media" title="Your own videos" sub="Local library" icon="💾" onSelect={() => nav.go('media')} />
      </Row>
    </PageScroll>
  );
}
