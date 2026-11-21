import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { appStore, reloadProfiles, toast, updateSettings, useApp, useAsync } from '../lib/app';
import { Button, Focusable, Loading } from '../components/ui';
import { ChoiceRow, SliderRow } from '../components/controls';
import { AddPlaylistButtons } from '../components/PlaylistManager';
import { TextField } from '../components/osk';
import { useKeys } from '../lib/nav';
import { AVATARS, STREAMING_APPS } from '../../shared/types';

const STEPS = ['Welcome', 'Television', 'Resolution', 'Audio', 'Remote', 'Internet', 'Live TV', 'Streaming', 'Profile'];

export function Setup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const finish = async () => { await updateSettings({ setupDone: true }); onDone(); };
  useKeys((e) => { if (e.k === 'back') { if (step > 0) back(); return true; } return false; });
  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-cinema fade-in" style={{ padding: 'var(--overscan)' }}>
      <div className="aurora"><i /><i /><i /></div>
      <div className="relative flex items-center gap-[0.6rem] px-[4rem] pt-[2.4rem]">
        <div className="mr-[1.2rem] text-[1.3rem] font-black tracking-[0.2em]">MY <span className="text-accent-cyan">SMART TV</span> · SETUP</div>
        {STEPS.map((s, i) => <div key={s} className={`h-[0.5rem] flex-1 rounded-full ${i <= step ? 'bg-gradient-to-r from-accent-purple to-accent-blue' : 'bg-white/15'}`} title={s} />)}
      </div>
      <div key={step} className="page-enter relative flex flex-1 flex-col items-center justify-center gap-[1.4rem] overflow-y-auto px-[6rem] py-[1rem]">
        <div className="text-[1.1rem] font-bold uppercase tracking-[0.3em] text-accent-cyan">Step {step + 1} of {STEPS.length} · {STEPS[step]}</div>
        {step === 0 && <Welcome />}{step === 1 && <TvDisplay />}{step === 2 && <Resolution />}{step === 3 && <AudioStep />}{step === 4 && <RemoteStep />}{step === 5 && <Internet />}{step === 6 && <LiveStep />}{step === 7 && <Streaming />}{step === 8 && <ProfileStep />}
      </div>
      <div className="relative flex justify-between px-[4rem] pb-[2.4rem]">
        <Button onSelect={back} disabled={step === 0}>← Back</Button>
        <div className="flex gap-[1rem]">
          {step > 0 && step < STEPS.length - 1 && <Button onSelect={next}>Skip</Button>}
          {step < STEPS.length - 1 ? <Button primary autoFocus={step === 0} onSelect={next}>{step === 0 ? 'Get started' : 'Next'} →</Button> : <Button primary onSelect={finish}>Finish & start watching ✓</Button>}
        </div>
      </div>
    </div>
  );
}

const Box = ({ children, w = 70 }: { children: ReactNode; w?: number }) => <div className="flex flex-col gap-[0.7rem]" style={{ width: `${w}rem`, maxWidth: '92vw' }}>{children}</div>;
const H = ({ children, sub }: { children: ReactNode; sub?: string }) => <div className="text-center"><h1 className="text-[3rem] font-black tracking-tight">{children}</h1>{sub && <p className="mx-auto mt-[0.5rem] max-w-[60rem] text-[1.3rem] leading-relaxed text-white/65">{sub}</p>}</div>;

function Welcome() {
  return <><div className="flex h-[7rem] w-[7rem] items-center justify-center rounded-[1.8rem] bg-gradient-to-br from-accent-purple to-accent-blue text-[3.6rem] shadow-2xl shadow-accent-purple/40">▶</div>
    <H sub="Let’s get your PC ready to be a Smart TV. This takes about two minutes and you can change everything later in Settings. You can use the arrow keys, OK and Back on a keyboard, remote or air mouse.">Welcome to MY SMART TV</H></>;
}

function TvDisplay() {
  const { settings } = useApp();
  const d = useAsync(() => api.display.list(), []);
  useEffect(() => api.on('display:changed', () => d.reload()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return <><H sub="Connect your PC to the TV with an HDMI cable, switch the TV to that HDMI input, then choose it below. If you only see one screen, the TV may be mirroring your monitor — that works too.">Which screen is your television?</H>
    {d.loading ? <Loading /> : <div className="flex flex-wrap justify-center gap-[1.4rem]">{d.data?.map((x, i) => (
      <Focusable key={x.id} autoFocus={i === 0 || x.isTarget} onSelect={() => { updateSettings({ displayId: x.id }); toast(`MY SMART TV will use ${x.label}`, 'ok', 2200); }} className={`f-card flex w-[24rem] flex-col gap-[0.4rem] rounded-[1.2rem] border-2 bg-ink-700 p-[1.4rem] ${settings.displayId === x.id || (settings.displayId === null && x.primary) ? 'border-accent-purple' : 'border-transparent'}`}>
        <div className="text-[2.4rem]">🖥️</div><div className="text-[1.4rem] font-bold">{x.label}</div><div className="text-[1.1rem] text-white/60">{x.width}×{x.height} · {x.refreshRate} Hz{x.primary ? ' · primary' : ''}</div>
        <div className="text-[1.05rem] text-accent-cyan">{settings.displayId === x.id || (settings.displayId === null && x.primary) ? '✓ Selected' : 'Select'}</div>
      </Focusable>))}</div>}</>;
}

function Resolution() {
  const s = useApp().settings;
  const d = useAsync(() => api.display.list(), []);
  const cur = d.data?.find((x) => x.isTarget);
  return <><H sub="MY SMART TV adapts to Full HD (1080p) and 4K automatically. Adjust the size so text is comfortable from your sofa, and the margin if your TV crops the edges.">Picture size</H>
    <Box w={56}>
      {cur && <div className="rounded-xl bg-white/5 px-[1.4rem] py-[0.9rem] text-center text-[1.3rem]">Detected: <b>{cur.width}×{cur.height}</b> ({cur.width >= 3800 ? '4K UHD' : cur.width >= 1900 ? 'Full HD' : 'HD'}) at {cur.refreshRate} Hz</div>}
      <SliderRow label="Interface size" value={s.uiScale} min={0.8} max={1.4} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings({ uiScale: v })} />
      <SliderRow label="Overscan-safe margin" desc="The purple frame shows the safe area." value={s.overscan} min={0} max={10} step={1} fmt={(v) => `${v}%`} onChange={(v) => updateSettings({ overscan: v })} />
    </Box>
    <div className="pointer-events-none fixed inset-0 z-[76]" style={{ padding: 'var(--overscan)' }}><div className="h-full w-full rounded-xl border-[0.2rem] border-dashed border-accent-purple/70" /></div></>;
}

function AudioStep() {
  const s = useApp().settings;
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([{ value: '', label: 'System default' }]);
  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then((l) => setDevices([{ value: '', label: 'System default' }, ...l.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d) => ({ value: d.deviceId, label: d.label || 'Audio device' }))])).catch(() => undefined); }, []);
  const test = async () => {
    try { const ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination(); const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.15 * s.volume; o.frequency.value = 523; o.connect(g); g.connect(dest); o.start(); o.stop(ctx.currentTime + 0.8); const el = new Audio(); el.srcObject = dest.stream; if (s.audioDeviceId && (el as any).setSinkId) await (el as any).setSinkId(s.audioDeviceId); await el.play(); setTimeout(() => ctx.close(), 1300); } catch { toast('Couldn’t play on that device', 'error'); }
  };
  return <><H sub="Choose where sound should come out — usually your TV’s HDMI audio. Play the tone to check.">Audio output</H>
    <Box w={56}><ChoiceRow label="Output device" value={s.audioDeviceId} onChange={(v) => updateSettings({ audioDeviceId: v })} options={devices} autoFocus /><SliderRow label="Volume" value={s.volume} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings({ volume: v })} /><Button className="self-center" onSelect={test} icon="🔊">Play test tone</Button></Box></>;
}

function RemoteStep() {
  const [last, setLast] = useState<string>('');
  const [pad, setPad] = useState(false);
  const [mouse, setMouse] = useState(false);
  useKeys((e) => { if (e.ev && !['back', 'select'].includes(e.k)) { setLast(e.ev.key === ' ' ? 'Space' : e.ev.key); return true; } if (e.ev) setLast(e.ev.key); return false; });
  useEffect(() => { const g = () => setPad(true); const m = () => setMouse(true); window.addEventListener('gamepadconnected', g); window.addEventListener('pointermove', m, { once: true }); setPad(Array.from(navigator.getGamepads?.() || []).some(Boolean)); return () => { window.removeEventListener('gamepadconnected', g); window.removeEventListener('pointermove', m); }; }, []);
  return <><H sub="Try your wireless keyboard, remote, air mouse or game controller now. Whatever you press shows up here.">Remote &amp; keyboard</H>
    <Box w={56}>
      <div className="rounded-2xl bg-white/5 py-[1.4rem] text-center"><div className="text-[1.1rem] text-white/50">Last key pressed</div><div className="mt-[0.3rem] text-[3rem] font-black text-accent-cyan">{last || '…'}</div></div>
      <div className="grid grid-cols-3 gap-[0.8rem] text-center text-[1.1rem]"><div className="rounded-xl bg-white/5 p-[0.8rem]">⌨️ Keyboard / remote<br /><b className={last ? 'text-emerald-400' : 'text-white/50'}>{last ? 'Working' : 'Waiting'}</b></div><div className="rounded-xl bg-white/5 p-[0.8rem]">🖱️ Air mouse<br /><b className={mouse ? 'text-emerald-400' : 'text-white/50'}>{mouse ? 'Detected' : 'Move it'}</b></div><div className="rounded-xl bg-white/5 p-[0.8rem]">🎮 Controller<br /><b className={pad ? 'text-emerald-400' : 'text-white/50'}>{pad ? 'Detected' : 'Press a button'}</b></div></div>
      <div className="rounded-xl bg-purple-500/15 px-[1.4rem] py-[0.8rem] text-[1.05rem] leading-relaxed text-white/75"><b>📱 Unified Remote:</b> use its <i>Basic Input</i> remote for the arrow keys, OK (Enter) and Back (Esc), <i>Media</i> for play/pause and seek, <i>Keyboard</i> for typing, and the touchpad as an air mouse. Add a custom shortcut button sending <b>Ctrl + Alt + H</b> to jump back to MY SMART TV from any app.</div>
      <div className="rounded-xl bg-white/5 px-[1.4rem] py-[0.8rem] text-[1.05rem] leading-relaxed text-white/60">Arrows move · Enter selects · Esc/Backspace goes back · Space plays/pauses · Page Up/Down changes channel · media keys work · Home (or Ctrl+Alt+H) returns from other apps. Controller: D-pad/stick, A = OK, B = back.</div>
    </Box></>;
}

function Internet() {
  const [ok, setOk] = useState<boolean | null>(null);
  const s = useApp().settings;
  const test = async () => { setOk(null); setOk(await api.system.internet()); };
  useEffect(() => { test(); }, []);
  return <><H sub="Live TV, metadata, sports scores and streaming apps need the internet. Connect Wi-Fi or Ethernet in Windows if this shows offline.">Internet connection</H>
    <Box w={50}><div className={`rounded-2xl py-[1.6rem] text-center text-[2.2rem] font-bold ${ok === null ? 'bg-white/5' : ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{ok === null ? 'Checking…' : ok ? '● Connected' : '⚠ No internet'}</div>
      <Button className="self-center" autoFocus onSelect={test}>Test again</Button>
      <ChoiceRow label="Your region" value={s.region} onChange={(v) => updateSettings({ region: v })} options={[['MY', 'Malaysia'], ['SG', 'Singapore'], ['ID', 'Indonesia'], ['TH', 'Thailand'], ['IN', 'India'], ['GB', 'United Kingdom'], ['US', 'United States'], ['AU', 'Australia']].map(([value, label]) => ({ value, label }))} /></Box></>;
}

function LiveStep() {
  const pl = useAsync(() => api.playlists.list(), []);
  return <><H sub="Add an IPTV playlist (M3U/M3U8) you’re entitled to watch — from a URL, a file or a USB drive. MY SMART TV doesn’t include any channels. You can skip this and add one later.">Live TV playlist</H>
    {pl.data && pl.data.length > 0 && <div className="rounded-xl bg-emerald-500/15 px-[1.4rem] py-[0.8rem] text-[1.2rem] text-emerald-300">✓ {pl.data.length} playlist{pl.data.length > 1 ? 's' : ''} added · {pl.data.reduce((a, p) => a + p.channelCount, 0)} channels</div>}
    <AddPlaylistButtons autoFocusFirst onDone={pl.reload} /></>;
}

function Streaming() {
  const b = useAsync(() => api.launch.browsers(), []);
  const s = useApp().settings;
  return <><H sub="Streaming apps open the official service in full screen. They need a DRM-capable browser, and you sign in once with your own account.">Streaming apps</H>
    <Box w={60}>
      <div className="rounded-xl bg-white/5 px-[1.4rem] py-[0.9rem] text-[1.2rem]">Browser: {b.data?.edge ? <b className="text-emerald-300">Microsoft Edge ✓</b> : b.data?.chrome ? <b className="text-emerald-300">Google Chrome ✓</b> : <b className="text-amber-300">none found — default browser will be used</b>} · VLC: {b.data?.vlc ? <b className="text-emerald-300">found ✓</b> : <span className="text-white/50">not installed (optional)</span>}</div>
      <div className="flex flex-wrap justify-center gap-[0.5rem]">{STREAMING_APPS.slice(0, 11).map((a) => <span key={a.id} className="rounded-full px-[0.9rem] py-[0.3rem] text-[1rem] font-bold" style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color2})` }}>{a.name}</span>)}</div>
      <TextField label="TMDB API key (optional)" mask value={s.tmdbKey} placeholder="Unlocks movie & series discovery" onChange={(v) => updateSettings({ tmdbKey: v })} />
    </Box></>;
}

function ProfileStep() {
  const { profiles } = useApp();
  const p = profiles[0];
  const [name, setName] = useState(p?.name || 'Family');
  const [avatar, setAvatar] = useState(p?.avatar || AVATARS[0]);
  useEffect(() => { if (p) { setName(p.name); setAvatar(p.avatar); } }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { if (!p) return; await api.profiles.save({ ...p, name: name.trim() || p.name, avatar }); await reloadProfiles(); appStore.set((s) => ({ profile: s.profile ? { ...s.profile, name, avatar } : s.profile })); toast('Profile saved', 'ok', 1800); };
  return <><H sub="Profiles keep favorites, watch history and parental limits separate. You can add more profiles later.">Create your profile</H>
    <Box w={50}><TextField label="Name" value={name} onChange={(v) => { setName(v); }} />
      <div className="flex flex-wrap justify-center gap-[0.5rem] py-[0.4rem]">{AVATARS.map((a) => <Focusable key={a} onSelect={() => setAvatar(a)} className={`f-tile flex h-[4.2rem] w-[4.2rem] items-center justify-center text-[2.2rem] ${a === avatar ? '!border-accent-purple !bg-accent-purple/30' : ''}`}>{a}</Focusable>)}</div>
      <Button className="self-center" primary onSelect={save}>Save profile</Button></Box></>;
}
