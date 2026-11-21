import { useEffect, useState } from 'react';
import { api, type DriveInfo } from '../lib/api';
import { localRequest, nav, playMedia, toast, useAsync } from '../lib/app';
import { Button, Card, EmptyState, Focusable, Loading, Modal, Pill, Row } from '../components/ui';
import { TextField } from '../components/osk';
import { PageScroll } from '../components/content';
import { Header } from './Titles';
import { fmtBytes } from '../lib/format';
import type { LibraryFolder } from '../../shared/types';

const KINDS: { id: LibraryFolder['kind']; label: string; icon: string }[] = [
  { id: 'movies', label: 'Movies', icon: '🎬' }, { id: 'shows', label: 'TV Series', icon: '🎞️' }, { id: 'music', label: 'Music', icon: '🎵' }, { id: 'videos', label: 'Other videos', icon: '📹' },
];

export function MyMedia() {
  const folders = useAsync(() => api.library.folders(), []);
  const media = useAsync(() => api.library.media({ limit: 3000 }), []);
  const [tab, setTab] = useState<'all' | 'movie' | 'episode' | 'music' | 'video'>('all');
  const [adding, setAdding] = useState<string | null>(null);
  const [drives, setDrives] = useState<DriveInfo[] | null>(null);
  const [rm, setRm] = useState<LibraryFolder | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  useEffect(() => api.on('library:progress', (p) => { if (p.state === 'scanning') setScanning(true); if (p.state === 'done' || p.state === 'enriched') { setScanning(false); folders.reload(); media.reload(); } }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFolder = async (kind: LibraryFolder['kind']) => {
    const p = adding; setAdding(null);
    if (!p) return;
    try { await api.library.add(p, kind); toast('Folder added — scanning…', 'ok'); } catch (e: any) { toast(e.message, 'error', 6000); }
    folders.reload(); media.reload();
  };
  const pick = async () => { const p = await api.dialog.folder(); if (p) setAdding(p); };
  const items = (media.data || []).filter((m) => tab === 'all' || m.kind === tab);

  return (
    <PageScroll>
      <Header title="My Media" subtitle="Movies, series, music and videos from this PC, USB drives and network shares" />
      <div className="flex flex-wrap gap-[0.8rem] px-[3.5rem] pb-[0.8rem]">
        <Button primary autoFocus icon="📁" onSelect={pick}>Add folder</Button>
        <Button icon="🔌" onSelect={async () => setDrives(await api.system.drives())}>USB &amp; drives</Button>
        <Button icon="🌐" onSelect={() => setManual(' ')}>Network share (\\server\share)</Button>
        <Button icon="📄" onSelect={async () => { const f = await api.dialog.file('media'); if (f) playMedia({ type: /\.(mp3|aac|flac|m4a|wav|ogg)$/i.test(f) ? 'audio' : 'vod', url: `tvmedia://local/${encodeURIComponent(f)}`, filePath: f, title: f.split(/[\\/]/).pop() || f, kind: 'file', ref: f }); }}>Play a file…</Button>
        {scanning && <span className="flex items-center gap-[0.6rem] text-[1.1rem] text-accent-cyan"><span className="spinner !h-[1.6rem] !w-[1.6rem] !border-[0.2rem]" /> Scanning…</span>}
      </div>

      {folders.loading ? <Loading /> : !folders.data?.length ? (
        <EmptyState icon="💾" title="No media folders yet" message="Add a folder and MY SMART TV will find your videos and music, group episodes into seasons, and fetch posters if you’ve added a TMDB key. USB drives and mapped network drives work too." />
      ) : (
        <>
          <Row title="Folders">
            {folders.data.map((f) => (
              <div key={f.id} className="shrink-0 px-[0.55rem] py-[0.9rem]" style={{ width: '25rem' }}>
                <Focusable fk={`folder:${f.id}`} onSelect={() => setRm(f)} className="f-card flex flex-col gap-[0.3rem] rounded-[1rem] bg-gradient-to-br from-ink-600 to-ink-800 p-[1.1rem]" style={{ width: '24rem', height: '8.5rem' }}>
                  <div className="text-[1.15rem] font-bold">{KINDS.find((k) => k.id === f.kind)?.icon} {KINDS.find((k) => k.id === f.kind)?.label}</div>
                  <div className="clamp-1 text-[0.95rem] text-white/55">{f.path}</div><div className="text-[1rem] text-accent-cyan">{f.itemCount} items · press OK to manage</div>
                </Focusable>
              </div>
            ))}
          </Row>
          <div className="flex gap-[0.6rem] px-[3.5rem] pb-[0.6rem]">
            {(['all', 'movie', 'episode', 'music', 'video'] as const).map((t) => <Pill key={t} fk={`mt:${t}`} active={tab === t} onSelect={() => setTab(t)}>{t === 'all' ? 'All' : t === 'movie' ? 'Movies' : t === 'episode' ? 'Episodes' : t === 'music' ? 'Music' : 'Videos'}</Pill>)}
          </div>
          {media.loading ? <Loading /> : items.length === 0 ? <div className="px-[3.5rem] py-[2rem] text-[1.2rem] text-white/50">Nothing found yet. Scanning continues in the background.</div> : (
            <div className="grid gap-x-[0.2rem] px-[3rem]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14.6rem, 1fr))' }}>
              {items.slice(0, 400).map((m) => <Card key={m.id} fk={`mi:${m.id}`} title={m.title} sub={m.kind === 'episode' ? m.show : m.kind === 'music' ? m.show : m.year ? String(m.year) : fmtBytes(m.size)} image={m.poster} icon={m.kind === 'music' ? '🎵' : undefined} onSelect={async () => playMedia(await localRequest(m))} />)}
            </div>
          )}
        </>
      )}

      {adding && (
        <Modal title="What’s in this folder?" onClose={() => setAdding(null)} width={50}>
          <div className="mb-[1rem] clamp-1 text-[1rem] text-white/50">{adding}</div>
          <div className="flex flex-col gap-[0.5rem]">{KINDS.map((k, i) => <Focusable key={k.id} autoFocus={i === 0} className="f-tile px-[1.3rem] py-[0.9rem] text-[1.3rem]" onSelect={() => addFolder(k.id)}>{k.icon} {k.label}</Focusable>)}</div>
        </Modal>
      )}
      {drives && (
        <Modal title="Drives" onClose={() => setDrives(null)} width={52}>
          <div className="flex flex-col gap-[0.5rem]">
            {drives.map((d, i) => <Focusable key={d.letter} autoFocus={i === 0} className="f-tile flex justify-between px-[1.2rem] py-[0.8rem] text-[1.2rem]" onSelect={() => { setDrives(null); setAdding(d.letter + '\\'); }}><span>{d.type === 'removable' ? '🔌 USB' : d.type === 'network' ? '🌐 Network' : '💽 Disk'} {d.letter} {d.label}</span><span className="text-white/50">{fmtBytes(d.free)} free</span></Focusable>)}
            {!drives.length && <div className="text-white/60">No drives detected.</div>}
          </div>
          <p className="mt-[0.8rem] text-[0.95rem] text-white/45">Selecting a drive adds the whole drive. Use “Add folder” to choose a specific folder instead.</p>
        </Modal>
      )}
      {manual && <ManualPath onClose={() => setManual('')} onPath={(p) => { setManual(''); setAdding(p); }} />}
      {rm && (
        <Modal title="Media folder" onClose={() => setRm(null)} width={50}
          footer={<>
            <Button autoFocus onSelect={() => setRm(null)}>Cancel</Button>
            <Button onSelect={async () => { const f = rm; setRm(null); await api.library.rescan(f.id); toast('Rescanning…', 'info'); }}>↻ Rescan</Button>
            <Button className="!bg-red-600 !border-red-500" onSelect={async () => { const f = rm; setRm(null); await api.library.remove(f.id); folders.reload(); media.reload(); toast('Folder removed (your files were not touched)', 'ok'); }}>Remove</Button>
          </>}>
          <div className="clamp-2 text-[1.2rem] text-white/70">{rm.path}</div>
          <p className="mt-[0.6rem] text-[1.05rem] text-white/50">Removing a folder only removes it from MY SMART TV; your files are never deleted.</p>
        </Modal>
      )}
    </PageScroll>
  );
}

function ManualPath({ onClose, onPath }: { onClose: () => void; onPath: (p: string) => void }) {
  const [v, setV] = useState('\\\\');
  return (
    <Modal title="Network share" onClose={onClose} width={56} footer={<><Button onSelect={onClose}>Cancel</Button><Button primary disabled={v.length < 4} onSelect={async () => { if (await window.tv.invoke('fs:exists', v)) onPath(v); else toast('That path can’t be reached. Check the share name and that this PC is signed in to it.', 'error', 6000); }}>Continue</Button></>}>
      <TextField label="Path" value={v} onChange={setV} placeholder="\\\\server\\share\\Movies" />
      <p className="mt-[0.8rem] text-[1rem] text-white/50">Use the UNC path of a share this PC can already open in File Explorer.</p>
    </Modal>
  );
}

