import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './lib/api';
import { appStore, loadLists, nav, reloadProfiles, routeStore, toast, TABS, updateSettings, useApp, useRoute, playMedia, channelRequest, isKids } from './lib/app';
import { initNav, setDefaultBack, setDefaultHome, useKeys } from './lib/nav';
import { Background, TopNav, Toasts } from './components/Shell';
import { PlayerHost } from './components/PlayerHost';
import { Screensaver } from './components/Screensaver';
import { FocusGlow } from './components/Effects';
import { Splash } from './components/Splash';
import { TileMenu } from './components/TileMenu';
import { BootSplash } from './components/BootSplash';
import { cancelSplash } from './lib/splash';
import { configureSfx, initSfx, play } from './lib/sfx';
import { initBattery } from './lib/battery';
import { syncApps } from './lib/appsync';
import { ProfilePicker } from './components/Profiles';
import { PinPrompt } from './components/osk';
import { Button, Modal } from './components/ui';
import { setSleepTimer } from './lib/sleep';
import { Home } from './pages/Home';
import { LiveTV, allowedChannel } from './pages/LiveTV';
import { Movies, Series, TitleDetail, ShowDetail } from './pages/Titles';
import { Sports } from './pages/Sports';
import { Apps } from './pages/Apps';
import { YouTube } from './pages/YouTube';
import { Music } from './pages/Music';
import { MyMedia } from './pages/MyMedia';
import { Favorites } from './pages/Favorites';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';

function Page() {
  const { route } = useRoute();
  const p = route.params || {};
  switch (route.page) {
    case 'home': return <Home />;
    case 'live': return <LiveTV />;
    case 'movies': return <Movies />;
    case 'series': return <Series />;
    case 'sports': return <Sports />;
    case 'apps': return <Apps />;
    case 'youtube': return <YouTube />;
    case 'music': return <Music />;
    case 'media': return <MyMedia />;
    case 'favorites': return <Favorites />;
    case 'search': return <Search />;
    case 'settings': return <Settings />;
    case 'title': return <TitleDetail kind={p.kind} id={p.id} />;
    case 'show': return <ShowDetail name={p.name} tmdbId={p.tmdbId} />;
    default: return <Home />;
  }
}

function PowerMenu({ onClose, onProfile }: { onClose: () => void; onProfile: () => void }) {
  const [desktop, setDesktop] = useState(false);
  return (
    <Modal title="Power & session" onClose={onClose} width={46}>
      <div className="flex flex-col gap-[0.6rem]">
        <Button autoFocus onSelect={() => { onClose(); onProfile(); }} icon="👤">Switch profile</Button>
        <Button onSelect={() => { onClose(); setSleepTimer(30); }} icon="⏾">Sleep timer: 30 minutes</Button>
        <Button onSelect={async () => { await api.system.desktopMode(!desktop); setDesktop(!desktop); onClose(); }} icon="🖥️">Exit TV mode (go to Windows desktop)</Button>
        <Button onSelect={() => api.system.sleepPc()} icon="💤">Put PC to sleep</Button>
        <Button className="!bg-red-600/80" onSelect={() => api.system.quit()} icon="⏻">Quit MY SMART TV</Button>
      </div>
    </Modal>
  );
}

// Wraps the app with the start-up intro: plays the chime once settings are known, keeps the intro up for at least
// ~3 s (so the animation completes), then fades it out over the ready UI.
export default function App() {
  const { loaded, settings } = useApp();
  const [boot, setBoot] = useState<'show' | 'fade' | 'gone'>('show');
  const t0 = useRef(performance.now());
  useEffect(() => {
    if (!loaded) return;
    if (!settings.bootSplash) { setBoot('gone'); return; }
    if (settings.uiSounds) play('startup');
    const wait = Math.max(300, 3100 - (performance.now() - t0.current));
    const a = setTimeout(() => setBoot('fade'), wait);
    const b = setTimeout(() => setBoot('gone'), wait + 800);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  // mount the heavy UI a beat after the intro starts so the first intro frames are perfectly smooth
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 450); return () => clearTimeout(t); }, []);
  return (<>{mounted && <AppInner />}{boot !== 'gone' && <BootSplash fading={boot === 'fade'} />}</>);
}

function AppInner() {
  const { settings, profile, profiles, loaded } = useApp();
  const [picking, setPicking] = useState(false);
  const [gate, setGate] = useState(false);
  const [power, setPower] = useState(false);
  const [needSetup, setNeedSetup] = useState(false);

  // ---- boot ----
  useEffect(() => {
    initNav();
    initSfx();
    initBattery();
    (window as any).__mstv = { updateSettings }; // diagnostics / automated checks
    setDefaultBack(() => nav.back());
    setDefaultHome(() => nav.go('home'));
    (async () => {
      try {
        const [s, ps] = await Promise.all([api.settings.get(), api.profiles.list()]);
        appStore.set({ settings: s, profiles: ps, loaded: true });
        const last = ps.find((p) => p.id === s.lastProfileId);
        if (s.setupDone && last && (!s.askProfileOnStart || ps.length === 1) && !last.hasPin) { appStore.set({ profile: last }); await loadLists(); }
        else if (s.setupDone && ps.length === 1 && !ps[0].hasPin) { appStore.set({ profile: ps[0] }); await loadLists(); }
        setNeedSetup(!s.setupDone);
        if (s.resumeLastRoute && (TABS as readonly string[]).includes(s.lastRoute) && s.setupDone) routeStore.set({ route: { page: s.lastRoute }, stack: [] });
      } catch (e: any) { toast('Could not start: ' + e.message, 'error', 8000); }
    })();
    const online = () => appStore.set({ online: true }); const offline = () => appStore.set({ online: false });
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    const t = setInterval(() => api.system.internet().then((o) => appStore.set({ online: o })).catch(() => undefined), 60000);
    api.system.internet().then((o) => appStore.set({ online: o })).catch(() => undefined);
    const off = api.on('tv:foreground', () => { window.focus(); cancelSplash(); play('wake'); setTimeout(() => syncApps(), 1500); });
    const onFocus = () => { syncApps(); };
    window.addEventListener('focus', onFocus);
    const syncTimer = setInterval(() => syncApps(), 120000);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); clearInterval(t); clearInterval(syncTimer); window.removeEventListener('focus', onFocus); off(); };
  }, []);

  // ---- apply display settings (layout effect: the theme must be on <html> before child effects read its colours) ----
  useLayoutEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = settings.theme;
    r.style.setProperty('--ui', String(settings.uiScale));
    r.style.setProperty('--overscan', `${settings.overscan}%`);
    r.classList.toggle('no-fx', !settings.animatedBackground);
    document.title = 'MY SMART TV';
  }, [settings.theme, settings.uiScale, settings.overscan, settings.animatedBackground]);

  // UI sound settings + startup chime (once, after the first screen is ready)
  useEffect(() => { configureSfx({ enabled: settings.uiSounds, volume: settings.uiSoundVolume, sink: settings.audioDeviceId, pack: settings.soundTheme }); }, [settings.uiSounds, settings.uiSoundVolume, settings.audioDeviceId, settings.soundTheme]);

  // first scan for installed streaming apps shortly after a profile is active
  useEffect(() => { if (!profile) return; const t = setTimeout(() => syncApps(true), 4000); return () => clearTimeout(t); }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // setup wizard completed/restarted → re-evaluate
  useEffect(() => { if (loaded) setNeedSetup(!settings.setupDone); }, [loaded, settings.setupDone]);

  // ---- resume last channel (optional) ----
  useEffect(() => {
    if (!loaded || !profile || !settings.resumeLastChannel || !settings.lastChannelId) return;
    (async () => {
      const [c] = await api.channels.list({ ids: [settings.lastChannelId!] });
      if (c && allowedChannel(c, profile)) playMedia(channelRequest(c, (await api.channels.list({ playlistId: c.playlistId, limit: 12000 })).filter((x) => allowedChannel(x, profile))));
    })().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, profile?.id]);

  // profile gate: no profile chosen yet → show picker
  const mustPick = loaded && !needSetup && !profile;
  useKeys(() => false);

  const switchProfile = async () => {
    const s = appStore.get();
    if (isKids() && s.settings.parentalEnabled && (await api.parental.hasPin())) { setGate(true); return; }
    await reloadProfiles(); setPicking(true);
  };

  if (!loaded) return <div className="flex h-full items-center justify-center bg-cinema"><div className="spinner" /></div>;
  if (needSetup) return <Setup onDone={() => { setNeedSetup(false); if (!appStore.get().profile) { const p = appStore.get().profiles[0]; if (p) appStore.set({ profile: p }); loadLists(); } updateSettings({ lastRoute: 'home' }); nav.go('home'); }} />;
  if (mustPick) return <><Background /><ProfilePicker onDone={() => { /* profile set */ }} /><Toasts /></>;

  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ padding: 'var(--overscan)' }}>
      <Background />
      <TopNav onProfile={switchProfile} onPower={() => setPower(true)} />
      <Page />
      {picking && <ProfilePicker canCancel onCancel={() => setPicking(false)} onDone={() => { setPicking(false); nav.go('home'); }} />}
      {gate && <PinPrompt title="Parental PIN to leave Kids profile" onClose={() => setGate(false)} onVerify={async (p) => { if (await api.parental.verify(p)) { setGate(false); await reloadProfiles(); setPicking(true); return true; } return false; }} />}
      {power && <PowerMenu onClose={() => setPower(false)} onProfile={switchProfile} />}
      <FocusGlow />
      <TileMenu />
      <Splash />
      <PlayerHost />
      <Screensaver />
      <Toasts />
      <div className="hidden" aria-hidden>{profiles.length}</div>
    </div>
  );
}
