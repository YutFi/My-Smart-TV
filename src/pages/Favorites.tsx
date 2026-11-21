import { useState } from 'react';
import { api } from '../lib/api';
import { pid, toast, useAsync, useLists, loadLists } from '../lib/app';
import { Button, Confirm, EmptyState, Loading, Row } from '../components/ui';
import { ListItemCard, PageScroll } from '../components/content';
import { Header } from './Titles';
import type { ListItem } from '../../shared/types';

const GROUPS: { kinds: string[]; title: string }[] = [
  { kinds: ['channel'], title: 'Channels' }, { kinds: ['movie', 'tv'], title: 'Movies & Series' }, { kinds: ['media'], title: 'My Media' },
  { kinds: ['station'], title: 'Radio' }, { kinds: ['youtube'], title: 'YouTube' }, { kinds: ['team'], title: 'Teams' },
];

export function Favorites() {
  const { version } = useLists();
  const fav = useAsync(() => api.lists.get(pid(), 'favorites'), [version]);
  const wl = useAsync(() => api.lists.get(pid(), 'watchlist'), [version]);
  const hist = useAsync(() => api.history.list(pid(), { limit: 30 }), []);
  const [clear, setClear] = useState(false);
  if (fav.loading) return <PageScroll><Loading /></PageScroll>;
  const empty = !fav.data?.length && !wl.data?.length && !hist.data?.length;
  return (
    <PageScroll>
      <Header title="Favorites" subtitle="Your channels, titles, stations and watch history" />
      {empty && <EmptyState icon="⭐" title="Nothing saved yet" message="Press the ☆ button on a channel, add titles to your Watchlist from their detail page, or press F on a channel while watching." />}
      {GROUPS.map((g) => { const items = (fav.data || []).filter((i) => g.kinds.includes(i.kind)); return items.length ? <Row key={g.title} title={g.title}>{items.map((it: ListItem) => <ListItemCard key={it.kind + it.ref} it={it} fk={`fav:${it.kind}:${it.ref}`} />)}</Row> : null; })}
      {!!wl.data?.length && <Row title="Watchlist">{wl.data.map((it) => <ListItemCard key={it.kind + it.ref} it={it} fk={`wl:${it.kind}:${it.ref}`} />)}</Row>}
      {!!hist.data?.length && <Row title="Watch History" action={<div className="pb-[0.2rem]"><Button className="!py-[0.35rem] !text-[1rem]" onSelect={() => setClear(true)}>Clear history</Button></div>}>{hist.data.map((h) => <ListItemCard key={h.kind + h.ref} it={h} fk={`his:${h.kind}:${h.ref}`} progress={h.duration ? h.position / h.duration : 0} />)}</Row>}
      {clear && <Confirm danger title="Clear watch history?" message="This removes Continue Watching and Recently Watched for this profile. Favorites and watchlist are kept." confirmLabel="Clear" onClose={() => setClear(false)} onConfirm={async () => { await api.history.clear(pid()); toast('History cleared', 'ok'); hist.reload(); loadLists(); }} />}
    </PageScroll>
  );
}
