import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { appStore, nav, playMedia, reloadProfiles, toast, updateSettings, useApp, useAsync, useRoute } from '../lib/app';
import { Button, Confirm, Focusable, Loading, Modal } from '../components/ui';
import { ChoiceRow, SectionTitle, SettingRow, SliderRow, ToggleRow } from '../components/controls';
import { PinPrompt, TextField } from '../components/osk';
import { PlaylistManager } from '../components/PlaylistManager';
import { ProfileEditor } from '../components/Profiles';
import { PageScroll } from '../components/content';
import { setSleepTimer } from '../lib/sleep';
import { previewScreensaver } from '../components/Screensaver';
import { play } from '../lib/sfx';
import { fmtBytes } from '../lib/format';
import { Header } from './Titles';
import type { Profile } from '../../shared/types';

const SECTIONS = [
  { id: 'general', label: 'General', icon: '🎛️' }, { id: 'profiles', label: 'Profiles', icon: '👤' }, { id: 'display', label: 'Display', icon: '🖥️' },
  { id: 'audio', label: 'Audio', icon: '🔊' }, { id: 'live', label: 'Live TV', icon: '📺' }, { id: 'player', label: 'Player', icon: '▶️' },
  { id: 'network', label: 'Network', icon: '🌐' }, { id: 'parental', label: 'Parental Control', icon: '🔒' }, { id: 'system', label: 'System', icon: '⚙️' },
];

let parentalUnlocked = false;

export function Settings() {
  const { route } = useRoute();
  const [section, setSection] = useState<string>(route.params?.section || 'general');
  const [needPin, setNeedPin] = useState(false);
  const go = async (id: string) => {
    if (id === 'parental' && !parentalUnlocked && (await api.parental.hasPin())) { setNeedPin(true); return; }
    setSection(id);
  };
  return (
    <PageScroll>
      <Header title="Settings" />
      <div className="flex gap-[2rem] px-[3.5rem]">
        <aside className="w-[20rem] shrink-0">
          <div className="flex flex-col gap-[0.35rem]">
            {SECTIONS.map((s, i) => <Focusable key={s.id} fk={`set:${s.id}`} autoFocus={i === 0} onSelect={() => go(s.id)} className={`f-tile flex items-center gap-[0.8rem] px-[1.1rem] py-[0.75rem] text-[1.2rem] font-semibold ${section === s.id ? '!bg-accent-purple/40 !border-accent-purple' : ''}`}><span>{s.icon}</span>{s.label}</Focusable>)}
          </div>
        </aside>
        <section className="min-w-0 flex-1 pb-[2rem]">
          {section === 'general' && <General />}{section === 'profiles' && <Profiles />}{section === 'display' && <Display />}{section === 'audio' && <AudioSettings />}
          {section === 'live' && <LiveSettings />}{section === 'player' && <PlayerSettings />}{section === 'network' && <Network />}{section === 'parental' && <Parental />}{section === 'system' && <System />}
        </section>
      </div>
      {needPin && <PinPrompt title="Parental PIN" onClose={() => setNeedPin(false)} onVerify={async (p) => { if (await api.parental.verify(p)) { parentalUnlocked = true; setSection('parental'); return true; } return false; }} />}
    </PageScroll>
  );
}

const col = 'flex flex-col gap-[0.5rem]';

function General() {
  const s = useApp().settings;
  const [rows, setRows] = useState(false);
  const [sleep, setSleep] = useState(false);
  return (
    <div className={col}>
      <SectionTitle>Appearance</SectionTitle>
      <ChoiceRow label="Theme" value={s.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'cinematic', label: 'Cinematic (purple & blue)' }, { value: 'midnight', label: 'Midnight blue' }, { value: 'oled', label: 'OLED black' }]} />
      <ChoiceRow label="Language" desc="Applies to movie/series metadata and the navigation bar. Other screens are English." value={s.language} onChange={(v) => updateSettings({ language: v })} options={[{ value: 'en', label: 'English' }, { value: 'ms', label: 'Bahasa Melayu' }, { value: 'zh', label: '中文' }, { value: 'ta', label: 'தமிழ்' }]} />
      <ToggleRow label="Animated backgrounds & effects" desc="Floating light particles, focus glow and shine effects. Turn off on slow PCs. They pause automatically during video and games." value={s.animatedBackground} onChange={(v) => updateSettings({ animatedBackground: v })} />
      <ToggleRow label="Sound effects" desc="Soft sounds when you move, select and go back, plus the startup chime and app launch whoosh." value={s.uiSounds} onChange={(v) => { updateSettings({ uiSounds: v }); if (v) setTimeout(() => play('select'), 80); }} />
      <SliderRow label="Sound effects volume" value={s.uiSoundVolume} min={0.1} max={1} step={0.1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => { updateSettings({ uiSoundVolume: v }); setTimeout(() => play('select'), 80); }} />
      <ToggleRow label="App launch splash screen" desc="An animated splash in the app's colours (with sound) while Netflix, Nebula, YouTube and other apps open. Press Back to cancel." value={s.launchSplash} onChange={(v) => updateSettings({ launchSplash: v })} />
      <SettingRow label="Home screen rows" desc="Choose which rows appear on Home and their order." right="Customize ›" onSelect={() => setRows(true)} />
      <SectionTitle>Startup</SectionTitle>
      <ToggleRow label="Start with Windows (TV mode)" desc="Launch MY SMART TV full screen when you sign in to Windows. Works in the installed app." value={s.autoStart} onChange={(v) => updateSettings({ autoStart: v })} />
      <ToggleRow label="Open full screen" value={s.startupFullscreen} onChange={(v) => updateSettings({ startupFullscreen: v })} />
      <ToggleRow label="Restore last screen" desc="Reopen the section you were using." value={s.resumeLastRoute} onChange={(v) => updateSettings({ resumeLastRoute: v })} />
      <ToggleRow label="Resume last channel" desc="Start playing the last live channel automatically." value={s.resumeLastChannel} onChange={(v) => updateSettings({ resumeLastChannel: v })} />
      <ToggleRow label="Ask “Who’s watching?” at start" value={s.askProfileOnStart} onChange={(v) => updateSettings({ askProfileOnStart: v })} />
      <SectionTitle>Gaming & power</SectionTitle>
      <ChoiceRow label="Nebula tile opens" desc="The desktop client has a fixed-size window (MY SMART TV centres it borderless on screen). The website runs the browser version in true full screen." value={s.nebulaMode} onChange={(v) => updateSettings({ nebulaMode: v })} options={[{ value: 'desktop', label: 'Desktop client (best-fit)' }, { value: 'web', label: 'Website — true full screen' }]} />
      <ToggleRow label="Gaming mode (Nebula & Windows games)" desc="When you open Nebula or a Windows game from MY SMART TV: switches Windows to the High performance power plan (restored afterwards), keeps the screen awake, and makes MY SMART TV use almost no CPU/GPU in the background." value={s.gamingMode} onChange={(v) => updateSettings({ gamingMode: v })} />
      <SettingRow label="Sleep timer" desc="Stop playback after a set time." right="Set ›" onSelect={() => setSleep(true)} />
      <ChoiceRow label="When the sleep timer ends" value={s.sleepAction} onChange={(v) => updateSettings({ sleepAction: v })} options={[{ value: 'stop', label: 'Stop playback' }, { value: 'sleep-pc', label: 'Stop and put the PC to sleep' }]} />
      <ChoiceRow label="Screensaver starts after" desc="Animated ambient scenes appear after inactivity when nothing is playing." value={s.screensaverMinutes} onChange={(v) => updateSettings({ screensaverMinutes: v })} options={[{ value: 0, label: 'Never' }, { value: 1, label: '1 minute' }, { value: 3, label: '3 minutes' }, { value: 5, label: '5 minutes' }, { value: 10, label: '10 minutes' }, { value: 20, label: '20 minutes' }]} />
      <ChoiceRow label="Screensaver style" value={s.screensaverStyle} onChange={(v) => updateSettings({ screensaverStyle: v })} options={[{ value: 'auto', label: 'Auto (rotates all scenes)' }, { value: 'aurora', label: 'Aurora lights' }, { value: 'stars', label: 'Starfield' }, { value: 'bokeh', label: 'Floating lights' }, { value: 'waves', label: 'Moonlit waves' }, { value: 'grid', label: 'Neon horizon' }, { value: 'artwork', label: 'Movie artwork (needs TMDB key)' }]} />
      <SettingRow label="Preview screensaver" desc="Press any key to exit the preview." right="▶ Preview" onSelect={() => previewScreensaver()} />
      {rows && <HomeRows onClose={() => setRows(false)} />}
      {sleep && (
        <Modal title="Sleep timer" onClose={() => setSleep(false)} width={40}>
          <div className="grid grid-cols-3 gap-[0.8rem]">{[0, 15, 30, 45, 60, 90, 120, 180].map((m, i) => <Button key={m} autoFocus={i === 0} onSelect={() => { setSleepTimer(m); setSleep(false); }}>{m ? `${m} min` : 'Off'}</Button>)}</div>
        </Modal>
      )}
    </div>
  );
}

const ROW_LABELS: Record<string, string> = { continue: 'Continue Watching', live: 'Live TV', trending: 'Trending Movies', series: 'Popular Series', sports: 'Sports', apps: 'Apps & Websites', youtube: 'YouTube', music: 'Music', media: 'My Media', favorites: 'Favorites', watchlist: 'Watchlist', recent: 'Recently Watched', recommended: 'Recommended' };
function HomeRows({ onClose }: { onClose: () => void }) {
  const s = useApp().settings;
  const all = Object.keys(ROW_LABELS);
  const shown = s.homeRows;
  const hidden = all.filter((r) => !shown.includes(r));
  const move = (i: number, d: number) => { const a = [...shown]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; updateSettings({ homeRows: a }); };
  return (
    <Modal title="Home screen rows" onClose={onClose} width={56} footer={<Button primary autoFocus onSelect={onClose}>Done</Button>}>
      <div className="flex max-h-[56vh] flex-col gap-[0.4rem] overflow-y-auto">
        {shown.map((r, i) => (
          <div key={r} className="flex items-center gap-[0.5rem]">
            <div className="flex-1 rounded-lg bg-white/5 px-[1rem] py-[0.55rem] text-[1.2rem]">{ROW_LABELS[r]}</div>
            <Button onSelect={() => move(i, -1)} disabled={i === 0}>↑</Button><Button onSelect={() => move(i, 1)} disabled={i === shown.length - 1}>↓</Button>
            <Button className="!text-red-300" onSelect={() => updateSettings({ homeRows: shown.filter((x) => x !== r) })}>Hide</Button>
          </div>
        ))}
        {hidden.map((r) => <div key={r} className="flex items-center gap-[0.5rem] opacity-70"><div className="flex-1 rounded-lg bg-white/[0.03] px-[1rem] py-[0.55rem] text-[1.2rem] text-white/50">{ROW_LABELS[r]} (hidden)</div><Button onSelect={() => updateSettings({ homeRows: [...shown, r] })}>Show</Button></div>)}
      </div>
    </Modal>
  );
}

function Profiles() {
  const { profiles, profile } = useApp();
  const [edit, setEdit] = useState<Profile | 'new' | null>(null);
  return (
    <div className={col}>
      <SectionTitle>User profiles</SectionTitle>
      {profiles.map((p) => <SettingRow key={p.id} label={`${p.avatar}  ${p.name}`} desc={`${p.kids ? 'Kids · ' : ''}${p.hasPin ? 'PIN protected · ' : ''}${p.id === profile?.id ? 'Current profile' : ''}`} right="Edit ›" onSelect={() => setEdit(p)} />)}
      <SettingRow label="＋ Add profile" right="" onSelect={() => setEdit('new')} />
      {edit && <ProfileEditor profile={edit === 'new' ? undefined : edit} onClose={() => { setEdit(null); reloadProfiles(); }} />}
    </div>
  );
}

function Display() {
  const s = useApp().settings;
  const d = useAsync(() => api.display.list(), []);
  const [fs, setFs] = useState(true);
  useEffect(() => api.on('display:changed', () => d.reload()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = d.data?.find((x) => x.isTarget);
  return (
    <div className={col}>
      <SectionTitle>HDMI / TV display</SectionTitle>
      {d.loading ? <Loading /> : (
        <>
          <ChoiceRow label="Show MY SMART TV on" desc="Pick the screen that is your television (HDMI). Reconnecting it is handled automatically." value={String(s.displayId ?? 'auto')} onChange={(v) => updateSettings({ displayId: v === 'auto' ? null : Number(v) })}
            options={[{ value: 'auto', label: 'Primary display (automatic)' }, ...(d.data || []).map((x) => ({ value: String(x.id), label: `${x.label}${x.primary ? ' (primary)' : ''}`, sub: `${x.width}×${x.height} @ ${x.refreshRate} Hz` }))]} />
          {cur && <div className="rounded-xl bg-white/5 px-[1.4rem] py-[1rem] text-[1.15rem] leading-relaxed text-white/75">
            <b className="text-white">{cur.label}</b> — {cur.width}×{cur.height} ({cur.width >= 3800 ? '4K UHD' : cur.width >= 2500 ? '1440p' : cur.width >= 1900 ? 'Full HD 1080p' : 'HD'}) · {cur.refreshRate} Hz · {cur.colorDepth}-bit{cur.hdr ? ' · HDR capable' : ''} · Windows scale {Math.round(cur.scaleFactor * 100)}%
            <div className="text-[0.95rem] text-white/45">To change resolution or refresh rate use Windows Settings → System → Display (MY SMART TV adapts automatically).</div></div>}
        </>
      )}
      <SectionTitle>Picture fit</SectionTitle>
      <SliderRow label="Interface size" desc="Scales everything. 100% is tuned for a TV viewed from a sofa." value={s.uiScale} min={0.8} max={1.4} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings({ uiScale: v })} />
      <SliderRow label="Overscan-safe margin" desc="Pulls the interface in from the screen edges if your TV crops the picture." value={s.overscan} min={0} max={10} step={1} fmt={(v) => `${v}%`} onChange={(v) => updateSettings({ overscan: v })} />
      <SectionTitle>Window</SectionTitle>
      <SettingRow label="Full screen / desktop" desc="Switch between borderless full screen on the TV and a normal Windows window." right={fs ? 'Go to desktop ›' : 'Back to full screen ›'} onSelect={async () => { await api.system.desktopMode(fs); setFs(!fs); }} />
    </div>
  );
}

function AudioSettings() {
  const s = useApp().settings;
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([{ value: '', label: 'System default' }]);
  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then((l) => setDevices([{ value: '', label: 'System default' }, ...l.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d) => ({ value: d.deviceId, label: d.label || 'Audio device' }))])).catch(() => undefined); }, []);
  const test = async () => {
    try {
      const ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination(); const osc = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.15 * s.volume;
      osc.frequency.value = 523; osc.connect(g); g.connect(dest); osc.start(); osc.stop(ctx.currentTime + 0.7);
      const el = new Audio(); el.srcObject = dest.stream; if (s.audioDeviceId && (el as any).setSinkId) await (el as any).setSinkId(s.audioDeviceId); await el.play();
      setTimeout(() => ctx.close(), 1200);
    } catch (e: any) { toast('Could not play the test tone on that device.', 'error'); }
  };
  return (
    <div className={col}>
      <SectionTitle>Output</SectionTitle>
      <ChoiceRow label="Audio output device" desc="Choose your HDMI/TV audio, a soundbar or headphones." value={s.audioDeviceId} onChange={(v) => updateSettings({ audioDeviceId: v })} options={devices} />
      <SliderRow label="Volume" value={s.volume} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings({ volume: v })} />
      <SettingRow label="Play test tone" desc="Confirms sound reaches the selected device." right="▶" onSelect={test} />
      <p className="px-[0.5rem] pt-[0.5rem] text-[1rem] text-white/45">HDMI audio devices appear after the TV is connected and powered on. Surround/passthrough formats are configured in Windows Sound settings.</p>
    </div>
  );
}

function LiveSettings() {
  const s = useApp().settings;
  const [url, setUrl] = useState('');
  const [purged, setPurged] = useState(false);
  return (
    <div className={col}>
      <SectionTitle>Playlists</SectionTitle>
      <PlaylistManager />
      <SectionTitle>TV guide (XMLTV)</SectionTitle>
      {s.epgUrls.map((u) => <SettingRow key={u} label={u} right="Remove" onSelect={() => updateSettings({ epgUrls: s.epgUrls.filter((x) => x !== u) })} />)}
      <TextField label="＋ Add guide URL" value={url} mode="url" placeholder="https://example.com/epg.xml.gz" onChange={(v) => { if (/^https?:\/\//.test(v)) { updateSettings({ epgUrls: [...s.epgUrls, v] }); api.epg.refresh().catch(() => undefined); } else if (v) toast('Enter a full http(s) address', 'error'); setUrl(''); }} />
      <ChoiceRow label="Refresh playlists every" value={s.playlistRefreshHours} onChange={(v) => updateSettings({ playlistRefreshHours: v })} options={[3, 6, 12, 24, 48].map((h) => ({ value: h, label: `${h} hours` }))} />
      <SectionTitle>Channel management</SectionTitle>
      <SettingRow label="Remove offline channels" desc="Deletes channels that failed to play. They return if a playlist refresh finds them again." right={purged ? 'Done ✓' : 'Clean up ›'} onSelect={async () => { const n = await api.channels.purgeBroken(); setPurged(true); toast(`Removed ${n} offline channel${n === 1 ? '' : 's'}`, 'ok'); }} />
    </div>
  );
}

function PlayerSettings() {
  const s = useApp().settings;
  const b = useAsync(() => api.launch.browsers(), []);
  return (
    <div className={col}>
      <SectionTitle>Engine</SectionTitle>
      <ChoiceRow label="Video engine" desc="Built-in plays most MP4/MKV/HLS/TS. VLC (if installed) opens in its own full-screen window and handles nearly every format." value={s.videoEngine} onChange={(v) => { if (v === 'vlc' && b.data && !b.data.vlc) toast('VLC isn’t installed — get it from videolan.org first.', 'error', 5000); updateSettings({ videoEngine: v }); }} options={[{ value: 'html5', label: 'Built-in player' }, { value: 'vlc', label: `VLC ${b.data?.vlc ? '(found)' : '(not installed)'}` }]} />
      <ToggleRow label="Hardware acceleration" desc="Uses your Intel, AMD or NVIDIA GPU for decoding. Applies after restarting the app." value={s.hwAccel} onChange={(v) => { updateSettings({ hwAccel: v }); toast('Restart MY SMART TV to apply', 'info', 4000); }} />
      <ToggleRow label="Play next episode automatically" value={s.autoplayNext} onChange={(v) => updateSettings({ autoplayNext: v })} />
      <SectionTitle>Subtitles & audio</SectionTitle>
      <ChoiceRow label="Preferred subtitle language" value={s.subtitleLang} onChange={(v) => updateSettings({ subtitleLang: v })} options={[{ value: 'en', label: 'English' }, { value: 'ms', label: 'Malay' }, { value: 'zh', label: 'Chinese' }, { value: 'ta', label: 'Tamil' }]} />
      <ChoiceRow label="Preferred audio language" value={s.audioLang} onChange={(v) => updateSettings({ audioLang: v })} options={[{ value: 'en', label: 'English' }, { value: 'ms', label: 'Malay' }, { value: 'zh', label: 'Chinese' }, { value: 'ta', label: 'Tamil' }]} />
      <SliderRow label="Subtitle size" value={s.subtitleSize} min={0.6} max={2} step={0.1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings({ subtitleSize: v })} />
      <ChoiceRow label="Subtitle color" value={s.subtitleColor} onChange={(v) => updateSettings({ subtitleColor: v })} options={[{ value: '#ffffff', label: 'White' }, { value: '#ffe066', label: 'Yellow' }, { value: '#7ee7ff', label: 'Cyan' }, { value: '#9dff9d', label: 'Green' }]} />
      <ToggleRow label="Subtitle background" value={s.subtitleBg} onChange={(v) => updateSettings({ subtitleBg: v })} />
      <SectionTitle>Diagnostics</SectionTitle>
      <SettingRow label="Play test stream" desc="Plays Blender’s open “Big Buck Bunny” over HLS to check playback, audio and the network." right="▶ Play" onSelect={() => playMedia({ type: 'vod', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', title: 'Big Buck Bunny (test stream)', subtitle: '© Blender Foundation · CC-BY', kind: 'test', ref: 'bbb' })} />
    </div>
  );
}

function Network() {
  const s = useApp().settings;
  const [online, setOnline] = useState<boolean | null>(null);
  const check = async () => { setOnline(null); setOnline(await api.system.internet()); };
  useEffect(() => { check(); }, []);
  const [feed, setFeed] = useState(() => { try { return localStorage.getItem('updateFeed') || ''; } catch { return ''; } });
  return (
    <div className={col}>
      <SectionTitle>Connection</SectionTitle>
      <SettingRow label="Internet connection" desc="Tests that this PC can reach the internet." right={online === null ? 'Checking…' : online ? '● Connected' : '⚠ Offline — Retest ›'} onSelect={check} />
      <SectionTitle>Movie & series data (TMDB)</SectionTitle>
      <TextField label="TMDB API key" mask value={s.tmdbKey} placeholder="Free key from themoviedb.org → Settings → API" onChange={(v) => updateSettings({ tmdbKey: v }).then(() => toast(v ? 'TMDB key saved (encrypted)' : 'TMDB key removed', 'ok'))} />
      <p className="px-[0.5rem] text-[0.95rem] text-white/40">Stored encrypted with Windows data protection. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      <SectionTitle>YouTube</SectionTitle>
      <TextField label="YouTube Data API key (optional)" mask value={s.youtubeKey} placeholder="Enables in-app YouTube search & trending" onChange={(v) => updateSettings({ youtubeKey: v }).then(() => toast('YouTube key saved', 'ok'))} />
      <SectionTitle>Streaming</SectionTitle>
      <ChoiceRow label="Browser for streaming apps" desc="Netflix, Disney+, Prime Video etc. need a DRM-capable browser." value={s.browser} onChange={(v) => updateSettings({ browser: v })} options={[{ value: 'auto', label: 'Automatic (Edge, then Chrome)' }, { value: 'edge', label: 'Microsoft Edge' }, { value: 'chrome', label: 'Google Chrome' }, { value: 'default', label: 'Windows default browser' }]} />
      <SettingRow label="Ad blocker for streaming apps & websites" desc="Opens the streaming browser with its toolbar so you can add a blocker such as uBlock Origin from the Edge Add-ons store (click “Get”). It then works in every app and website you open from MY SMART TV." right="Open store ›" onSelect={() => api.launch.browserSetup('https://microsoftedge.microsoft.com/addons/search/ublock').then((r) => { if (!r.ok) toast(r.error || 'Could not open the browser', 'error'); })} />
      <SettingRow label="Browser profile (sign-ins & extensions)" desc="Opens the streaming browser normally so you can sign in to sites or manage extensions." right="Open ›" onSelect={() => api.launch.browserSetup('https://www.bing.com/').then((r) => { if (!r.ok) toast(r.error || 'Could not open the browser', 'error'); })} />
      <ChoiceRow label="Region" desc="Used for trending, availability and radio." value={s.region} onChange={(v) => updateSettings({ region: v })} options={[['MY', 'Malaysia'], ['SG', 'Singapore'], ['ID', 'Indonesia'], ['TH', 'Thailand'], ['PH', 'Philippines'], ['IN', 'India'], ['GB', 'United Kingdom'], ['US', 'United States'], ['AU', 'Australia']].map(([value, label]) => ({ value, label }))} />
      <SectionTitle>Network media servers</SectionTitle>
      <SettingRow label="Network shares & NAS" desc="Add any SMB/UNC share (\\server\share) or mapped drive as a media library folder. UPnP/DLNA browsing and Plex/Jellyfin apps are not built in — open them from Apps." right="My Media ›" onSelect={() => nav.go('media')} />
      <TextField label="Update server (optional)" value={feed} mode="url" placeholder="https://your-server/updates/" onChange={(v) => { setFeed(v); try { localStorage.setItem('updateFeed', v); } catch { /* ignore */ } }} />
    </div>
  );
}

function Parental() {
  const s = useApp().settings;
  const [has, setHas] = useState<boolean | null>(null);
  const [ask, setAsk] = useState<'set' | 'remove' | null>(null);
  const [newPin, setNewPin] = useState('');
  useEffect(() => { api.parental.hasPin().then(setHas); }, [ask]);
  return (
    <div className={col}>
      <SectionTitle>Master PIN</SectionTitle>
      <SettingRow label={has ? 'Change master PIN' : 'Set master PIN'} desc="Protects this section and leaving Kids profiles." right="4 digits ›" onSelect={() => setAsk('set')} />
      {has && <SettingRow label="Remove master PIN" right="Remove" onSelect={() => setAsk('remove')} />}
      <SectionTitle>Restrictions</SectionTitle>
      <ToggleRow label="Require PIN to leave a Kids profile" value={s.parentalEnabled} onChange={(v) => { if (v && !has) { toast('Set a master PIN first', 'error'); return; } updateSettings({ parentalEnabled: v }); }} />
      <p className="px-[0.5rem] text-[1.05rem] text-white/55">Per-profile limits — maximum rating, blocked live-TV categories, Kids mode and profile PINs — are in <b>Settings → Profiles</b>.</p>
      <Button onSelect={() => nav.go('settings', { section: 'profiles' })}>Open Profiles</Button>
      {ask === 'set' && !newPin && <PinPrompt title={has ? 'Enter new 4-digit PIN' : 'Create a 4-digit PIN'} onClose={() => setAsk(null)} onVerify={async (p) => { if (has) { setNewPin(p); setAsk('remove'); return true; } try { await api.parental.setPin('', p); toast('Master PIN set', 'ok'); } catch (e: any) { toast(e.message, 'error'); } setAsk(null); return true; }} />}
      {ask === 'remove' && <PinPrompt title="Enter current PIN" onClose={() => { setAsk(null); setNewPin(''); }} onVerify={async (p) => { try { await api.parental.setPin(p, newPin || null); toast(newPin ? 'PIN changed' : 'PIN removed', 'ok'); if (!newPin) updateSettings({ parentalEnabled: false }); setNewPin(''); setAsk(null); return true; } catch (e: any) { toast(e.message, 'error'); return false; } }} />}
    </div>
  );
}

function System() {
  const info = useAsync(() => api.system.info(), []);
  const [logs, setLogs] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'quit' | 'restore' | null>(null);
  const [upd, setUpd] = useState('');
  const i = info.data;
  return (
    <div className={col}>
      <SectionTitle>About</SectionTitle>
      {info.loading ? <Loading /> : i && <div className="rounded-xl bg-white/5 px-[1.4rem] py-[1rem] text-[1.1rem] leading-relaxed text-white/75">
        <b className="text-white">MY SMART TV {i.version}</b> · Electron {i.electron} · Chromium {i.chrome}<br />{i.os} ({i.arch}) · {i.cpu}<br />Memory: {fmtBytes(i.memory.free)} free of {fmtBytes(i.memory.total)}<br />
        Video decode: {i.gpuFeatures?.video_decode ?? 'n/a'} · GPU compositing: {i.gpuFeatures?.gpu_compositing ?? 'n/a'}
      </div>}
      <SectionTitle>Storage</SectionTitle>
      {i?.drives?.map((d: any) => <div key={d.letter} className="flex justify-between rounded-lg bg-white/5 px-[1.4rem] py-[0.6rem] text-[1.1rem]"><span>{d.type === 'removable' ? '🔌' : d.type === 'network' ? '🌐' : '💽'} {d.letter} {d.label}</span><span className="text-white/60">{fmtBytes(d.free)} free / {fmtBytes(d.size)}</span></div>)}
      {i && <div className="px-[0.5rem] text-[0.95rem] text-white/40">App data: {i.dataPath} · database {fmtBytes(i.dbBytes)}</div>}
      <SectionTitle>Updates</SectionTitle>
      <SettingRow label="Check for updates" desc={upd || 'Uses the update server set in Settings → Network.'} right="Check ›" onSelect={async () => { setUpd('Checking…'); const r = await api.system.checkUpdate((() => { try { return localStorage.getItem('updateFeed') || ''; } catch { return ''; } })()); setUpd(r.message); }} />
      <SectionTitle>Backup</SectionTitle>
      <SettingRow label="Back up settings & data" desc="Saves profiles, favorites, history, playlists and settings to a file." right="Back up ›" onSelect={async () => { const r = await api.system.backup(); if (r.ok) toast(`Backup saved to ${r.path}`, 'ok', 6000); else if (r.error) toast(r.error, 'error'); }} />
      <SettingRow label="Restore from backup" desc="Replaces current data with a backup file, then restarts." right="Restore ›" onSelect={() => setConfirm('restore')} />
      <SectionTitle>Logs & setup</SectionTitle>
      <SettingRow label="View logs" right="Open ›" onSelect={async () => setLogs(await api.system.logs())} />
      <SettingRow label="Open log folder" right="Open ›" onSelect={() => api.system.openLogs()} />
      <SettingRow label="Run the setup wizard again" right="Start ›" onSelect={() => { updateSettings({ setupDone: false }); }} />
      <SectionTitle>Exit</SectionTitle>
      <SettingRow label="Exit to Windows" desc="Closes MY SMART TV and returns to the desktop." right="Exit ›" onSelect={() => setConfirm('quit')} />
      {logs !== null && <Modal title="Log" onClose={() => setLogs(null)} width={90} footer={<Button autoFocus onSelect={() => setLogs(null)}>Close</Button>}><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-[0.85rem] leading-snug text-white/70">{logs || 'No log entries yet.'}</pre></Modal>}
      {confirm === 'quit' && <Confirm title="Exit to Windows?" message="MY SMART TV will close." confirmLabel="Exit" onClose={() => setConfirm(null)} onConfirm={() => api.system.quit()} />}
      {confirm === 'restore' && <Confirm danger title="Restore a backup?" message="Your current profiles, favorites, history, playlists and settings will be replaced by the backup. The app restarts afterwards." confirmLabel="Choose backup…" onClose={() => setConfirm(null)} onConfirm={async () => { const r = await api.system.restore(); if (r.error) toast(r.error, 'error', 6000); }} />}
    </div>
  );
}

