import { useState } from 'react';
import { api } from '../lib/api';
import { pid, toast, useAsync } from '../lib/app';
import { Button, Card, Focusable, Modal, Row } from '../components/ui';
import { TextField } from '../components/osk';
import { AppTile, PageScroll, SiteTile } from '../components/content';
import { Header } from './Titles';
import { STREAMING_APPS } from '../../shared/types';

export function Apps() {
  const recents = useAsync(() => api.launch.recents(pid()), []);
  const sites = useAsync(() => api.lists.get(pid(), 'sites'), []);
  const browsers = useAsync(() => api.launch.browsers(), []);
  const [add, setAdd] = useState(false);
  const [name, setName] = useState(''); const [url, setUrl] = useState('https://');
  const recent = (recents.data || []).map((id) => STREAMING_APPS.find((a) => a.id === id)).filter(Boolean) as typeof STREAMING_APPS;
  const noBrowser = browsers.data && !browsers.data.edge && !browsers.data.chrome;
  return (
    <PageScroll>
      <Header title="Streaming Apps" subtitle="Opens the official service in full screen. Sign in once — your session is remembered." />
      <div className="px-[3.5rem] pb-[0.6rem]"><Button primary autoFocus icon="＋" onSelect={() => setAdd(true)}>Add a website</Button></div>
      {noBrowser &&<div className="mx-[3.5rem] mb-[0.8rem] rounded-xl bg-amber-500/15 px-[1.2rem] py-[0.8rem] text-[1.1rem] text-amber-200">Microsoft Edge or Google Chrome wasn’t found, so apps will open in your default browser instead.</div>}
      {recent.length > 0 && <Row title="Recently Opened">{recent.map((a) => <AppTile key={a.id} app={a} fk={`r:${a.id}`} />)}</Row>}
      <Row title="All Apps">{STREAMING_APPS.map((a, i) => <AppTile key={a.id} app={a} fk={`a:${a.id}`} />)}</Row>
      <Row title="My Websites" subtitle="Any streaming site or web app">
        {sites.data?.map((s) => <SiteTile key={s.ref} it={s} fk={`site:${s.ref}`} onKey={(e) => { if (e.k === 'menu') { api.lists.toggle(pid(), 'sites', s).then(sites.reload); return true; } }} />)}
        <Card fk="site:add" shape="logo" title="Add website" sub="Name + address" icon="＋" onSelect={() => setAdd(true)} />
      </Row>
      <div className="px-[3.5rem] pt-[1rem] text-[1.05rem] leading-relaxed text-white/50">
        <b className="text-white/70">Returning to MY SMART TV:</b> press <kbd className="rounded bg-white/10 px-[0.4rem]">Ctrl+Alt+H</kbd>, the remote’s <b>Home</b> key, or close the app window. These services use DRM that only a full browser provides, so they open in {browsers.data?.edge ? 'Microsoft Edge' : browsers.data?.chrome ? 'Google Chrome' : 'your browser'}; maximum quality depends on your PC and the service.
        <div className="mt-[0.4rem]">Press the remote’s <b>Menu</b> key on a website tile to remove it.</div>
      </div>
      {add && (
        <Modal title="Add website" onClose={() => setAdd(false)} width={56} footer={<><Button onSelect={() => setAdd(false)}>Cancel</Button><Button primary disabled={!/^https?:\/\/.+\..+/.test(url) || !name} onSelect={async () => { await api.lists.toggle(pid(), 'sites', { kind: 'site', ref: url, title: name, image: '' }); setAdd(false); setName(''); setUrl('https://'); sites.reload(); toast('Website added', 'ok'); }}>Save</Button></>}>
          <div className="flex flex-col gap-[0.8rem]"><TextField label="Name" value={name} onChange={setName} placeholder="e.g. Plex" /><TextField label="Address" value={url} onChange={setUrl} mode="url" /></div>
        </Modal>
      )}
    </PageScroll>
  );
}

