import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { pid, toast, useApp, useAsync } from '../lib/app';
import { Button, Card, Focusable, Loading, Modal, Row } from '../components/ui';
import { TextField } from '../components/osk';
import { AppTile, PageScroll, SiteTile } from '../components/content';
import { Header } from './Titles';
import { syncApps, dismissApp } from '../lib/appsync';
import { STREAMING_APPS } from '../../shared/types';

export function openStore(query?: string) {
  api.launch.store(query);
  toast('Opening the Microsoft Store — anything entertainment-related you install is added to MY SMART TV automatically when you come back', 'info', 7000);
}

export function Apps() {
  const { settings } = useApp();
  const recents = useAsync(() => api.launch.recents(pid()), []);
  const sites = useAsync(() => api.lists.get(pid(), 'sites'), []);
  const browsers = useAsync(() => api.launch.browsers(), []);
  const [add, setAdd] = useState(false);
  const [picker, setPicker] = useState(false);
  const [name, setName] = useState(''); const [url, setUrl] = useState('https://');
  const recent = (recents.data || []).map((id) => STREAMING_APPS.find((a) => a.id === id)).filter(Boolean) as typeof STREAMING_APPS;
  const noBrowser = browsers.data && !browsers.data.edge && !browsers.data.chrome;
  return (
    <PageScroll>
      <Header title="Streaming Apps" subtitle="Opens the official service in full screen. Sign in once — your session is remembered." />
      <div className="flex flex-wrap gap-[0.8rem] px-[3.5rem] pb-[0.6rem]">
        <Button primary autoFocus icon="🛍" onSelect={() => openStore()}>Microsoft Store</Button>
        <Button icon="🎬" onSelect={() => openStore('streaming movies tv')}>Find streaming apps</Button>
        <Button icon="📋" onSelect={() => setPicker(true)}>Add an installed app</Button>
        <Button icon="＋" onSelect={() => setAdd(true)}>Add a website</Button>
        <Button icon="🖥" onSelect={async () => {
          const p = await api.launch.pickProgram();
          if (!p) return;
          const title = (p.split(/[\\/]/).pop() || 'Program').replace(/\.exe$/i, '');
          await api.lists.toggle(pid(), 'sites', { kind: 'exe', ref: p, title, image: '' });
          sites.reload(); toast(`${title} added — it also appears on Home`, 'ok');
        }}>Add a program / game</Button>
        <Button icon="↻" onSelect={async () => { await syncApps(true); sites.reload(); toast('Checked for new streaming apps', 'info', 2500); }}>Scan now</Button>
      </div>
      {settings.autoAddApps && <div className="px-[3.5rem] pb-[0.4rem] text-[1.05rem] text-white/45">Install a streaming or entertainment app from the Microsoft Store and it appears here and on Home by itself.</div>}
      {noBrowser && <div className="mx-[3.5rem] mb-[0.8rem] rounded-xl bg-amber-500/15 px-[1.2rem] py-[0.8rem] text-[1.1rem] text-amber-200">Microsoft Edge or Google Chrome wasn’t found, so apps will open in your default browser instead.</div>}
      {recent.length > 0 && <Row title="Recently Opened">{recent.map((a) => <AppTile key={a.id} app={a} fk={`r:${a.id}`} />)}</Row>}
      <Row title="All Apps">{STREAMING_APPS.map((a) => <AppTile key={a.id} app={a} fk={`a:${a.id}`} />)}</Row>
      <Row title="My Apps, Programs & Websites" subtitle="Press Menu on a tile to remove it">
        {sites.data?.map((s) => (
          <SiteTile key={s.kind + s.ref} it={s} fk={`site:${s.kind}:${s.ref}`} onKey={(e) => {
            if (e.k === 'menu') { (s.kind === 'uwp' ? dismissApp(s.ref) : Promise.resolve()).then(() => api.lists.toggle(pid(), 'sites', s)).then(sites.reload); return true; }
          }} />
        ))}
        <Card fk="site:store" shape="logo" title="Get more apps" sub="Microsoft Store" icon="🛍" onSelect={() => openStore()} />
        <Card fk="site:add" shape="logo" title="Add website" sub="Name + address" icon="＋" onSelect={() => setAdd(true)} />
      </Row>
      <div className="px-[3.5rem] pt-[1rem] text-[1.05rem] leading-relaxed text-white/50">
        <b className="text-white/70">Returning to MY SMART TV:</b> click the <b>⌂ MY SMART TV</b> button that floats top-left, press <kbd className="rounded bg-white/10 px-[0.4rem]">Ctrl+Alt+H</kbd> or the remote’s <b>Home</b> key. Streaming websites use DRM that only a full browser provides, so they open in {browsers.data?.edge ? 'Microsoft Edge' : browsers.data?.chrome ? 'Google Chrome' : 'your browser'}.
      </div>
      {add && (
        <Modal title="Add website" onClose={() => setAdd(false)} width={56} footer={<><Button onSelect={() => setAdd(false)}>Cancel</Button><Button primary disabled={!/^https?:\/\/.+\..+/.test(url) || !name} onSelect={async () => { await api.lists.toggle(pid(), 'sites', { kind: 'site', ref: url, title: name, image: '' }); setAdd(false); setName(''); setUrl('https://'); sites.reload(); toast('Website added', 'ok'); }}>Save</Button></>}>
          <div className="flex flex-col gap-[0.8rem]"><TextField label="Name" value={name} onChange={setName} placeholder="e.g. Plex" /><TextField label="Address" value={url} onChange={setUrl} mode="url" /></div>
        </Modal>
      )}
      {picker && <InstalledAppsPicker onClose={() => setPicker(false)} onAdded={() => sites.reload()} />}
    </PageScroll>
  );
}

// Every app Windows has installed (Start menu): pick one to put a shortcut on Apps and Home.
function InstalledAppsPicker({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const apps = useAsync(() => api.apps.installed(), []);
  const have = useAsync(() => api.lists.get(pid(), 'sites'), []);
  const [q, setQ] = useState('');
  const list = useMemo(() => (apps.data || []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase())).slice(0, 80), [apps.data, q]);
  const added = new Set((have.data || []).map((i) => i.ref));
  return (
    <Modal title="Add an installed app" onClose={onClose} width={64}>
      <TextField label="🔍 Filter" value={q} onChange={setQ} placeholder="Type part of the app name" />
      <div data-vscroll="" className="mt-[0.8rem] flex max-h-[52vh] flex-col gap-[0.4rem] overflow-y-auto">
        {apps.loading && <Loading label="Reading your installed apps…" />}
        {list.map((a, i) => (
          <Focusable key={a.appId} autoFocus={i === 0 && !!q} className="f-tile flex items-center justify-between px-[1.2rem] py-[0.7rem] text-[1.2rem]" onSelect={async () => {
            if (added.has(a.appId)) { toast(`${a.name} is already added`, 'info'); return; }
            await api.lists.toggle(pid(), 'sites', { kind: 'uwp', ref: a.appId, title: a.name, image: '' });
            toast(`${a.name} added to Apps and Home`, 'ok'); have.reload(); onAdded();
          }}>
            <span className="clamp-1">{a.name}</span><span className="text-accent-cyan">{added.has(a.appId) ? '✓ added' : '＋ add'}</span>
          </Focusable>
        ))}
        {!apps.loading && list.length === 0 && <div className="py-[1rem] text-white/55">No matching apps.</div>}
      </div>
    </Modal>
  );
}
