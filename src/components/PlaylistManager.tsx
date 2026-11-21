import { useEffect, useState } from 'react';
import { api, type DriveInfo } from '../lib/api';
import { toast, useAsync } from '../lib/app';
import { Button, Confirm, Focusable, Loading, Modal } from './ui';
import { TextField } from './osk';
import { fmtBytes } from '../lib/format';
import type { Playlist } from '../../shared/types';

// Public, community-maintained lists of publicly available free-to-air channels (iptv-org). Offered as a convenience — the
// user decides whether to add them; nothing is bundled. Availability and legality of individual streams varies by country.
const IPTV = 'https://iptv-org.github.io/iptv';
export const PUBLIC_PLAYLISTS = [
  { name: 'Malaysia (public channels)', url: `${IPTV}/countries/my.m3u` },
  { name: 'Malay-language channels', url: `${IPTV}/languages/msa.m3u` },
  { name: 'Singapore (public channels)', url: `${IPTV}/countries/sg.m3u` },
  { name: 'Chinese-language channels', url: `${IPTV}/languages/zho.m3u` },
  { name: 'English-language channels', url: `${IPTV}/languages/eng.m3u` },
  { name: 'Tamil-language channels', url: `${IPTV}/languages/tam.m3u` },
  { name: 'News (public)', url: `${IPTV}/categories/news.m3u` },
  { name: 'Sports (public)', url: `${IPTV}/categories/sports.m3u` },
  { name: 'Movies (public)', url: `${IPTV}/categories/movies.m3u` },
  { name: 'Entertainment (public)', url: `${IPTV}/categories/entertainment.m3u` },
  { name: 'Music (public)', url: `${IPTV}/categories/music.m3u` },
  { name: 'Kids (public)', url: `${IPTV}/categories/kids.m3u` },
];

export function usePlaylists() {
  const st = useAsync(() => api.playlists.list(), []);
  useEffect(() => api.on('iptv:progress', () => st.reload()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

export async function addPlaylistFlow(input: { name: string; source: string; kind: 'url' | 'file'; epgUrl?: string }): Promise<boolean> {
  toast(`Importing “${input.name}”…`, 'info', 2500);
  try {
    await api.playlists.add(input);
    const list = await api.playlists.list();
    const added = list.find((p) => p.source === input.source) || list[list.length - 1];
    if (added?.error) { toast(added.error, 'error', 7000); return false; }
    toast(`Imported ${added?.channelCount ?? 0} channels from “${input.name}”`, 'ok');
    api.epg.refresh().catch(() => undefined);
    return true;
  } catch (e: any) { toast(e.message || 'Import failed', 'error', 7000); return false; }
}

export function AddPlaylistButtons({ onDone, autoFocusFirst }: { onDone: () => void; autoFocusFirst?: boolean }) {
  const [urlOpen, setUrlOpen] = useState(false);
  const [drives, setDrives] = useState<DriveInfo[] | null>(null);
  const [pub, setPub] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('My playlist'); const [url, setUrl] = useState(''); const [epg, setEpg] = useState('');
  const run = async (fn: () => Promise<boolean>) => { setBusy(true); const ok = await fn(); setBusy(false); if (ok) onDone(); };
  return (
    <>
      <div className="mb-[0.4rem] flex flex-wrap justify-center gap-[1rem]">
        <Button primary autoFocus={autoFocusFirst} icon="⚡" onSelect={() => run(async () => {
          let ok = false;
          for (const p of PUBLIC_PLAYLISTS.slice(0, 3)) ok = (await addPlaylistFlow({ name: p.name, source: p.url, kind: 'url' })) || ok;
          return ok;
        })}>Quick start: Malaysia + Malay + Singapore channels</Button>
      </div>
      <div className="flex flex-wrap justify-center gap-[1rem]">
        <Button icon="🔗" onSelect={() => setUrlOpen(true)}>Add by URL</Button>
        <Button icon="📄" onSelect={async () => { const p = await api.dialog.file('playlist'); if (p) run(() => addPlaylistFlow({ name: p.split(/[\\/]/).pop() || 'Playlist', source: p, kind: 'file' })); }}>Import file</Button>
        <Button icon="🔌" onSelect={async () => setDrives(await api.system.drives())}>USB / network drive</Button>
        <Button icon="🌐" onSelect={() => setPub(true)}>Public channel lists</Button>
      </div>
      {busy && <Loading label="Importing playlist…" />}
      {urlOpen && (
        <Modal title="Add playlist by URL" onClose={() => setUrlOpen(false)} width={60}
          footer={<><Button onSelect={() => setUrlOpen(false)}>Cancel</Button><Button primary disabled={!url} onSelect={() => { setUrlOpen(false); run(() => addPlaylistFlow({ name, source: url.trim(), kind: 'url', epgUrl: epg.trim() })); }}>Import</Button></>}>
          <div className="flex flex-col gap-[0.8rem]">
            <TextField label="Name" value={name} onChange={setName} />
            <TextField label="Playlist URL (.m3u / .m3u8)" value={url} onChange={setUrl} mode="url" placeholder="https://example.com/playlist.m3u" />
            <TextField label="EPG / XMLTV URL (optional)" value={epg} onChange={setEpg} mode="url" placeholder="https://example.com/guide.xml.gz" />
            <p className="mt-[0.4rem] text-[1rem] text-white/50">Only add playlists you are legally entitled to use. MY SMART TV does not include or endorse any channel list.</p>
          </div>
        </Modal>
      )}
      {drives && (
        <Modal title="Drives" onClose={() => setDrives(null)} width={50}>
          <p className="mb-[0.8rem] text-[1.1rem] text-white/60">Pick a drive to browse for a playlist file. For network shares, map them as a drive letter in Windows first (or choose the share in the file dialog).</p>
          <div className="flex flex-col gap-[0.5rem]">
            {drives.map((d) => (
              <Focusable key={d.letter} onSelect={async () => { setDrives(null); const p = await api.dialog.file('playlist'); if (p) run(() => addPlaylistFlow({ name: p.split(/[\\/]/).pop() || 'Playlist', source: p, kind: 'file' })); }} className="f-tile flex justify-between px-[1.2rem] py-[0.8rem] text-[1.2rem]">
                <span>{d.type === 'removable' ? '🔌' : d.type === 'network' ? '🌐' : '💽'} {d.letter} {d.label}</span><span className="text-white/50">{fmtBytes(d.free)} free of {fmtBytes(d.size)}</span>
              </Focusable>
            ))}
            {!drives.length && <div className="text-white/60">No drives found.</div>}
          </div>
        </Modal>
      )}
      {pub && (
        <Modal title="Public channel lists" onClose={() => setPub(false)} width={54}>
          <p className="mb-[1rem] text-[1.05rem] leading-snug text-white/60">Community lists of publicly available channels from <b>iptv-org</b>. Quality and availability vary; some streams may be offline or geo-restricted. You are responsible for using content lawfully in your region.</p>
          <div data-vscroll="" className="flex max-h-[52vh] flex-col gap-[0.5rem] overflow-y-auto">
            {PUBLIC_PLAYLISTS.map((p, i) => <Focusable key={p.url} autoFocus={i === 0} className="f-tile px-[1.2rem] py-[0.9rem] text-[1.2rem]" onSelect={() => { setPub(false); run(() => addPlaylistFlow({ name: p.name, source: p.url, kind: 'url' })); }}>＋ {p.name}</Focusable>)}
          </div>
        </Modal>
      )}
    </>
  );
}

export function PlaylistManager() {
  const { data, loading, reload } = usePlaylists();
  const [confirm, setConfirm] = useState<Playlist | null>(null);
  const [busy, setBusy] = useState<number | 'all' | 'epg' | null>(null);
  return (
    <div className="flex flex-col gap-[1rem]">
      {loading && !data && <Loading />}
      {data?.map((p) => (
        <div key={p.id} className="rounded-[1rem] border border-white/10 bg-white/5 p-[1.2rem]">
          <div className="flex items-center gap-[1rem]">
            <div className="min-w-0 flex-1"><div className="clamp-1 text-[1.4rem] font-bold">{p.name}</div>
              <div className="clamp-1 text-[0.95rem] text-white/50">{p.kind === 'file' ? '📄 ' : '🔗 '}{p.source}</div>
              <div className={`text-[1rem] ${p.error ? 'text-amber-400' : 'text-white/60'}`}>{p.error ? `⚠ ${p.error}` : `${p.channelCount} channels · updated ${p.updatedAt ? new Date(p.updatedAt).toLocaleString() : 'never'}`}</div></div>
            <Button disabled={busy === p.id} onSelect={async () => { setBusy(p.id); const r = await api.playlists.refresh(p.id); setBusy(null); reload(); toast(r.ok ? `Updated: ${r.count} channels` : r.error || 'Refresh failed', r.ok ? 'ok' : 'error', 5000); }}>{busy === p.id ? 'Refreshing…' : '↻ Refresh'}</Button>
            <Button onSelect={async () => { await api.playlists.update(p.id, { autoUpdate: !p.autoUpdate }); reload(); }}>{p.autoUpdate ? '⏱ Auto-update on' : '⏱ Auto-update off'}</Button>
            <Button className="!text-red-300" onSelect={() => setConfirm(p)}>🗑</Button>
          </div>
          <div className="mt-[0.7rem]"><TextField label="EPG (XMLTV) URL" value={p.epgUrl} placeholder="Uses the guide address inside the playlist if present" mode="url" onChange={async (v) => { await api.playlists.update(p.id, { epgUrl: v }); reload(); }} /></div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-[1rem]">
        <Button disabled={busy === 'all'} onSelect={async () => { setBusy('all'); await api.playlists.refreshAll(); setBusy(null); reload(); toast('All playlists refreshed', 'ok'); }}>↻ Refresh all playlists</Button>
        <Button disabled={busy === 'epg'} onSelect={async () => { setBusy('epg'); try { const r = await api.epg.refresh(); toast(r.sources ? `Guide updated: ${r.programmes} programmes` : 'No guide sources configured or reachable', r.sources ? 'ok' : 'error', 5000); } catch (e: any) { toast(e.message, 'error'); } setBusy(null); }}>{busy === 'epg' ? 'Loading guide…' : '📅 Refresh TV guide'}</Button>
      </div>
      <AddPlaylistButtons onDone={reload} />
      {confirm && <Confirm danger title="Remove playlist?" message={`“${confirm.name}” and its ${confirm.channelCount} channels will be removed from MY SMART TV. The original file or URL is not touched.`} confirmLabel="Remove" onClose={() => setConfirm(null)} onConfirm={async () => { await api.playlists.remove(confirm.id); reload(); }} />}
    </div>
  );
}
