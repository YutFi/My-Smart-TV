import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import * as dashjs from 'dashjs';
import { api } from '../lib/api';
import { appStore, channelRequest, pid, playMedia, playerStore, stopPlayer, toast, toggleList, updateSettings, useApp, useLists, type PlayRequest } from '../lib/app';
import { useStore } from '../lib/store';
import { pushScope, popScope, useKeys, focusFirst, type KeyEv } from '../lib/nav';
import { Button, Focusable, Modal, Art } from './ui';
import { fmtClock, fmtTime } from '../lib/format';
import { cueAt, parseSubtitles, type Cue } from '../lib/subtitles';
import type { Programme } from '../../shared/types';

type Phase = 'loading' | 'playing' | 'buffering' | 'reconnecting' | 'error';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const isHlsUrl = (u: string) => /\.m3u8(\?|$)|\/hls\/|format=m3u8/i.test(u);

export function PlayerHost() {
  const { req } = useStore(playerStore);
  const settings = useApp().settings;
  // external VLC engine: hand off instead of using the in-app player
  useEffect(() => {
    if (req && settings.videoEngine === 'vlc' && req.type !== 'audio') {
      api.launch.vlc(req.filePath || req.url).then((r) => { if (!r.ok) toast(r.error || 'VLC failed to start', 'error', 6000); });
      stopPlayer();
    }
  }, [req, settings.videoEngine]);
  if (!req || (settings.videoEngine === 'vlc' && req.type !== 'audio')) return null;
  return <Player key={req.type === 'live' ? 'live' : req.url} req={req} />;
}

function Player({ req }: { req: PlayRequest }) {
  const { settings } = useApp();
  const { fav } = useLists();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const tsRef = useRef<mpegts.Player | null>(null);
  const retryRef = useRef(0);
  const attemptRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [retryInfo, setRetryInfo] = useState('');
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [controls, setControls] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [vol, setVol] = useState(settings.volume);
  const [muted, setMuted] = useState(false);
  const [osd, setOsd] = useState('');
  const [menu, setMenu] = useState<'' | 'tracks' | 'channels' | 'speed'>('');
  const [epg, setEpg] = useState<{ now?: Programme; next?: Programme }>({});
  const [numBuf, setNumBuf] = useState('');
  const [nextUp, setNextUp] = useState<PlayRequest | null>(null);
  const [nextCount, setNextCount] = useState(0);
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; active: boolean }[]>([]);
  const [subSources, setSubSources] = useState<{ id: string; label: string; cues?: Cue[] }[]>([]);
  const [subId, setSubId] = useState('off');
  const [subDelay, setSubDelay] = useState(0);
  const [cue, setCue] = useState<Cue | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const osdTimer = useRef<number | undefined>(undefined);
  const numTimer = useRef<number | undefined>(undefined);
  const lastSave = useRef(0);
  const live = req.type === 'live';
  const isAudio = req.type === 'audio';
  const ch = req.channel;

  const showControls = useCallback((ms = 4500) => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (!menuRef.current) setControls(false); }, ms);
  }, []);
  const menuRef = useRef('');
  menuRef.current = menu;
  const flash = (msg: string) => { setOsd(msg); clearTimeout(osdTimer.current); osdTimer.current = window.setTimeout(() => setOsd(''), 1600); };

  // ----- scope + keep display awake -----
  useEffect(() => {
    const el = rootRef.current!;
    pushScope(el);
    api.system.keepAwake(true).catch(() => undefined);
    return () => { popScope(el); api.system.keepAwake(false).catch(() => undefined); };
  }, []);

  // ----- source loading with reconnection -----
  const loadRef = useRef<() => void>(() => undefined);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const teardown = useCallback(() => {
    hlsRef.current?.destroy(); hlsRef.current = null;
    try { dashRef.current?.destroy(); } catch { /* ignore */ } dashRef.current = null;
    try { tsRef.current?.destroy(); } catch { /* ignore */ } tsRef.current = null;
  }, []);

  const failed = useCallback((why: string) => {
    teardown();
    if (retryRef.current < 3 && navigator.onLine) {
      retryRef.current += 1;
      const delay = 1500 * Math.pow(2, retryRef.current - 1);
      setPhase('reconnecting'); setRetryInfo(`Reconnecting… attempt ${retryRef.current} of 3`);
      window.setTimeout(() => loadRef.current(), delay);
    } else {
      setPhase('error');
      setErrMsg(!navigator.onLine ? 'No internet connection. Playback will resume when the network is back.' : why);
      if (live && ch) api.channels.broken(ch.id, true).catch(() => undefined);
      setControls(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, ch?.id]);

  const loadNow = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    teardown();
    const myAttempt = ++attemptRef.current;
    setPhase((p) => (p === 'reconnecting' ? p : 'loading'));
    const url = req.url;
    const onFatal = (why: string) => { if (myAttempt === attemptRef.current) failed(why); };
    try {
      if (/\.mpd(\?|$)/i.test(url)) {
        const dp = dashjs.MediaPlayer().create();
        dashRef.current = dp;
        dp.initialize(v, url, true);
        dp.on('error', () => onFatal('This MPEG-DASH stream could not be played. It may be offline or region-locked.'));
        dp.on('streamInitialized', refreshAudio);
      } else if (isHlsUrl(url) && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: live ? 20 : 40, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3, startPosition: req.startAt || -1 });
        hlsRef.current = hls;
        hls.loadSource(url); hls.attachMedia(v);
        let netRetries = 0;
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 2) { netRetries++; hls.startLoad(); return; }
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && netRetries < 4) { netRetries++; hls.recoverMediaError(); return; }
          onFatal(d.type === Hls.ErrorTypes.NETWORK_ERROR ? 'The stream could not be reached. It may be offline or blocked.' : 'This stream could not be decoded.');
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => undefined); });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, refreshAudio);
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, refreshAudio);
      } else if (live && !isHlsUrl(url) && mpegts.isSupported() && !/\.(mp4|webm|mp3|aac)(\?|$)/i.test(url)) {
        const p = mpegts.createPlayer({ type: 'mpegts', isLive: true, url }, { enableWorker: true, liveBufferLatencyChasing: true, liveBufferLatencyMaxLatency: 8, liveBufferLatencyMinRemain: 2 });
        tsRef.current = p; p.attachMediaElement(v); p.load();
        p.on(mpegts.Events.ERROR, () => {
          // some servers actually deliver HLS/MP4 without a telling extension — fall back to the native decoder once
          if (myAttempt !== attemptRef.current) return;
          teardown(); v.src = url; v.play().catch(() => undefined);
        });
        v.play().catch(() => undefined);
      } else {
        v.src = url;
        if (req.startAt) v.currentTime = req.startAt;
        v.play().catch(() => undefined);
      }
    } catch (e: any) { onFatal(e?.message || 'Playback failed.'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.url, req.startAt, live, failed]);

  // some providers need a specific User-Agent/Referer (from the playlist) — apply it before the first request
  const load = useCallback(() => {
    api.system.streamHeaders(req.channel?.ua || '', req.channel?.referrer || '').catch(() => undefined).then(() => loadNow());
  }, [req.channel?.ua, req.channel?.referrer, loadNow]);

  loadRef.current = load;

  function refreshAudio() {
    const v = videoRef.current; const out: { id: number; label: string; active: boolean }[] = [];
    if (hlsRef.current && hlsRef.current.audioTracks.length > 1) {
      hlsRef.current.audioTracks.forEach((t, i) => out.push({ id: i, label: t.name || t.lang || `Track ${i + 1}`, active: hlsRef.current!.audioTrack === i }));
    } else if (v && (v as any).audioTracks && (v as any).audioTracks.length > 1) {
      const at = (v as any).audioTracks;
      for (let i = 0; i < at.length; i++) out.push({ id: i, label: at[i].label || at[i].language || `Track ${i + 1}`, active: !!at[i].enabled });
    }
    setAudioTracks(out);
  }

  useEffect(() => {
    retryRef.current = 0;
    load();
    return () => { teardown(); attemptRef.current++; };
  }, [req.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- media events -----
  useEffect(() => {
    const v = videoRef.current!;
    v.volume = settings.volume;
    const sink = settings.audioDeviceId;
    if (sink && (v as any).setSinkId) (v as any).setSinkId(sink).catch(() => toast('The selected audio device is unavailable — using the default output.', 'error'));
    const on = (ev: string, fn: () => void) => { v.addEventListener(ev, fn); return () => v.removeEventListener(ev, fn); };
    const offs = [
      on('playing', () => { setPhase('playing'); retryRef.current = 0; setRetryInfo(''); setPaused(false); refreshAudio(); if (live && ch) api.channels.broken(ch.id, false).catch(() => undefined); }),
      on('pause', () => setPaused(true)),
      on('play', () => setPaused(false)),
      on('waiting', () => setPhase((p) => (p === 'playing' ? 'buffering' : p))),
      on('canplay', () => setPhase((p) => (p === 'buffering' || p === 'loading' ? 'playing' : p))),
      on('loadedmetadata', () => { setDur(Number.isFinite(v.duration) ? v.duration : 0); refreshAudio(); }),
      on('durationchange', () => setDur(Number.isFinite(v.duration) ? v.duration : 0)),
      on('timeupdate', () => {
        setTime(v.currentTime);
        if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
        if (!live && Date.now() - lastSave.current > 10000 && v.currentTime > 5) { lastSave.current = Date.now(); saveProgress(); }
      }),
      on('ended', () => { if (!live) { saveProgress(true); handleEnded(); } }),
      on('error', () => {
        const code = v.error?.code;
        const msg = code === 4 ? (req.filePath ? 'This file format or codec is not supported by the built-in player.' : 'This stream format is not supported.') : code === 2 ? 'A network error interrupted playback.' : 'Playback failed.';
        if (code === 4 && req.filePath) { setPhase('error'); setErrMsg(msg); setControls(true); } else if (v.src || live) failed(msg);
      }),
    ];
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.url]);

  // stall watchdog for live streams (stuck buffering > 20s)
  useEffect(() => {
    if (phase !== 'buffering' || !live) return;
    const t = window.setTimeout(() => failed('The stream stopped responding.'), 20000);
    return () => clearTimeout(t);
  }, [phase, live, failed]);

  // network drop/restore
  useEffect(() => {
    const off = () => { setPhase('reconnecting'); setRetryInfo('Waiting for the network…'); };
    const on = () => { retryRef.current = 0; load(); };
    window.addEventListener('offline', off); window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, [load]);

  // ----- history / progress -----
  const saveProgress = useCallback((finished = false) => {
    const v = videoRef.current; if (!v || live) return;
    const position = finished ? 0 : v.currentTime; const duration = Number.isFinite(v.duration) ? v.duration : 0;
    api.history.record(pid(), { kind: req.kind, ref: req.ref, title: req.title, image: req.image || '', sub: req.subtitle || '', data: req.data || {}, position, duration }).catch(() => undefined);
  }, [req, live]);
  useEffect(() => () => { saveProgress(); }, [saveProgress]);

  useEffect(() => {
    if (live && ch) {
      api.history.record(pid(), { kind: 'channel', ref: String(ch.id), title: ch.name, image: ch.logo, sub: ch.category, data: {} }).catch(() => undefined);
      if (appStore.get().settings.lastChannelId !== ch.id) updateSettings({ lastChannelId: ch.id });
    } else if (isAudio) {
      api.history.record(pid(), { kind: req.kind, ref: req.ref, title: req.title, image: req.image || '', sub: req.subtitle || '', data: req.data || {}, position: 0, duration: 0 }).catch(() => undefined);
    }
  }, [req.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- EPG now/next for live -----
  useEffect(() => {
    if (!live || !ch?.tvgId) { setEpg({}); return; }
    let on = true;
    const tick = () => api.epg.now([ch.tvgId]).then((r) => on && setEpg(r[ch.tvgId] || {})).catch(() => undefined);
    tick(); const t = setInterval(tick, 45000);
    return () => { on = false; clearInterval(t); };
  }, [ch?.tvgId, live]);

  // ----- subtitles -----
  useEffect(() => {
    let live2 = true;
    (async () => {
      const list: { id: string; label: string; cues?: Cue[] }[] = [];
      for (const p of req.subs || []) {
        try { list.push({ id: p, label: p.split(/[\\/]/).pop() || 'Subtitle', cues: parseSubtitles(await api.library.subtitle(p)) }); } catch { /* skip */ }
      }
      if (live2) { setSubSources(list); if (list.length) setSubId(list.find((s) => s.label.toLowerCase().includes(settings.subtitleLang))?.id || 'off'); }
    })();
    return () => { live2 = false; };
  }, [req.url]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const src = subSources.find((s) => s.id === subId);
    if (!src?.cues) { setCue(null); return; }
    setCue(cueAt(src.cues, time - subDelay));
  }, [time, subId, subDelay, subSources]);

  const loadSubFile = async () => {
    const p = await api.dialog.file('subtitle'); if (!p) return;
    try { const cues = parseSubtitles(await api.library.subtitle(p)); setSubSources((s) => [...s, { id: p, label: p.split(/[\\/]/).pop() || 'Subtitle', cues }]); setSubId(p); } catch { toast('Could not read that subtitle file.', 'error'); }
  };

  // ----- actions -----
  const toggle = () => { const v = videoRef.current!; if (v.paused) v.play().catch(() => undefined); else v.pause(); showControls(); };
  const seek = (d: number) => { const v = videoRef.current!; if (!dur) return; v.currentTime = Math.max(0, Math.min(dur - 1, v.currentTime + d)); flash(`${d > 0 ? '⏩' : '⏪'} ${fmtTime(v.currentTime)}`); showControls(); };
  const setVolume = (x: number) => { const v = videoRef.current!; const n = Math.max(0, Math.min(1, x)); v.volume = n; v.muted = false; setVol(n); setMuted(false); flash(`🔊 ${Math.round(n * 100)}%`); updateSettings({ volume: n }); };
  const mute = () => { const v = videoRef.current!; v.muted = !v.muted; setMuted(v.muted); flash(v.muted ? '🔇 Muted' : '🔊 Unmuted'); };
  const close = () => { saveProgress(); stopPlayer(); };

  const queue = req.queue || [];
  const idx = ch ? queue.findIndex((c) => c.id === ch.id) : -1;
  const goChannel = (delta: number) => {
    if (!queue.length) return;
    const n = queue[(Math.max(0, idx) + delta + queue.length) % queue.length];
    playMedia(channelRequest(n, queue)); showControls(5000);
  };
  const goNumber = (num: number) => { const c = queue.find((x) => x.num === num); if (c) playMedia(channelRequest(c, queue)); else flash(`No channel ${num}`); };

  function handleEnded() {
    if (!req.next || !appStore.get().settings.autoplayNext) { setControls(true); return; }
    req.next().then((n) => { if (n) { setNextUp(n); setNextCount(10); } else { setControls(true); } });
  }
  useEffect(() => {
    if (!nextUp) return;
    if (nextCount <= 0) { playMedia(nextUp); return; }
    const t = setTimeout(() => setNextCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [nextUp, nextCount]);

  // ----- keys -----
  useKeys((e: KeyEv) => {
    if (menu) return false; // menus are modals with their own handling
    const k = e.k;
    if (nextUp) { if (k === 'back') { setNextUp(null); return true; } if (k === 'select') { playMedia(nextUp); return true; } return false; }
    if (k === 'back' || k === 'backspace' || k === 'stop') { close(); return true; }
    if (k === 'home') { close(); return true; }
    if (k === 'playpause' || k === 'play' || k === 'pause') { toggle(); return true; }
    if (k === 'ff') { seek(30); return true; }
    if (k === 'rw') { seek(-30); return true; }
    if (k === 'volup') { setVolume(vol + 0.05); return true; }
    if (k === 'voldown') { setVolume(vol - 0.05); return true; }
    if (k === 'mute') { mute(); return true; }
    if (k === 'pgup' || (k === 'next' && live)) { if (live) { goChannel(1); return true; } }
    if (k === 'pgdn' || (k === 'prev' && live)) { if (live) { goChannel(-1); return true; } }
    if (k === 'char') {
      const c = e.ch.toLowerCase();
      if (/\d/.test(c) && live) { setNumBuf((b) => { const nb = (b + c).slice(0, 4); clearTimeout(numTimer.current); numTimer.current = window.setTimeout(() => { goNumber(parseInt(nb, 10)); setNumBuf(''); }, 1400); return nb; }); return true; }
      if (c === 'm') { mute(); return true; }
      if (c === 'f' && ch) { toggleList('favorites', chanItem()); return true; }
      if (c === 'i') { showControls(8000); return true; }
      if (c === 'c' || c === 's' || c === 'a') { setMenu('tracks'); return true; }
      if (c === 'l' && live) { setMenu('channels'); return true; }
      if (c === '+' || c === '=') { setVolume(vol + 0.05); return true; }
      if (c === '-') { setVolume(vol - 0.05); return true; }
    }
    if (!controls) {
      // controls hidden: the remote works like a TV remote
      if (k === 'select' || k === 'space') { if (live) showControls(); else toggle(); return true; }
      if (k === 'left') { if (!live) seek(-10); else showControls(); return true; }
      if (k === 'right') { if (!live) seek(10); else showControls(); return true; }
      if (k === 'up') { if (live) goChannel(1); else showControls(); return true; }
      if (k === 'down') { if (live) goChannel(-1); else showControls(); return true; }
      if (k === 'menu') { showControls(); return true; }
    } else {
      showControls();
      if (k === 'space') { toggle(); return true; }
      if (live && (k === 'up' || k === 'down') && !(document.activeElement as HTMLElement | null)?.closest('[data-pbar]')) {
        // up/down still zap channels while the info bar is showing
        if (k === 'up') { goChannel(1); return true; } if (k === 'down') { goChannel(-1); return true; }
      }
    }
    return false;
  });

  useEffect(() => { if (controls) { const el = rootRef.current; if (el && !el.contains(document.activeElement)) focusFirst(el); } }, [controls]);
  useEffect(() => { showControls(6000); return () => { clearTimeout(hideTimer.current); clearTimeout(osdTimer.current); clearTimeout(numTimer.current); }; }, [showControls, req.url]);

  const chanItem = () => ({ kind: 'channel', ref: String(ch!.id), title: ch!.name, image: ch!.logo, sub: ch!.category });
  const isFav = ch ? fav.has(`channel:${ch.id}`) : false;
  const progPct = useMemo(() => (epg.now ? Math.max(0, Math.min(100, ((Date.now() - epg.now.start) / (epg.now.stop - epg.now.start)) * 100)) : 0), [epg.now, time]);
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 15000); return () => clearInterval(t); }, []);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[60] bg-black" style={{ cursor: controls ? 'default' : 'none' }} onMouseMove={() => { if (!controls) showControls(); }} onClick={() => { if (!controls) showControls(); }}>
      <video ref={videoRef} className="absolute inset-0 h-full w-full bg-black" style={{ objectFit: 'contain', display: isAudio ? 'none' : 'block' }} playsInline />
      {isAudio && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2rem] bg-cinema">
          <div className="aurora"><i /><i /><i /></div>
          <div className="relative h-[24rem] w-[24rem] overflow-hidden rounded-[1.4rem] shadow-2xl"><Art src={req.image} title={req.title} className="h-full w-full" /></div>
          <div className="relative text-center"><div className="text-[2.6rem] font-bold text-shadow">{req.title}</div><div className="text-[1.4rem] text-[color:var(--muted)]">{req.subtitle}</div></div>
        </div>
      )}

      {/* subtitles */}
      {cue && !isAudio && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-[10%]" style={{ bottom: controls ? '16rem' : '5rem' }}>
          <div className="whitespace-pre-line rounded-lg px-[1.2rem] py-[0.4rem] text-center font-semibold leading-snug" style={{ fontSize: `${2 * settings.subtitleSize}rem`, color: settings.subtitleColor, background: settings.subtitleBg ? 'rgba(0,0,0,0.65)' : 'transparent', textShadow: '0 0 0.4rem #000, 0 0 0.8rem #000' }}>{cue.text}</div>
        </div>
      )}

      {/* status overlays */}
      {(phase === 'loading' || phase === 'buffering' || phase === 'reconnecting') && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[1rem] bg-black/30">
          <div className="spinner" />
          <div className="text-[1.4rem] font-semibold text-shadow">{phase === 'reconnecting' ? retryInfo : phase === 'buffering' ? 'Buffering…' : `Loading ${req.title}…`}</div>
        </div>
      )}
      {phase === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[1.2rem] bg-black/80 px-[8rem] text-center">
          <div className="text-[4rem]">⚠️</div>
          <div className="text-[2.2rem] font-bold">Can’t play {req.title}</div>
          <div className="max-w-[60rem] text-[1.3rem] text-[color:var(--muted)]">{errMsg}</div>
          <div className="mt-[1rem] flex flex-wrap justify-center gap-[1rem]">
            <Button autoFocus primary onSelect={() => { retryRef.current = 0; setPhase('loading'); load(); }}>Try again</Button>
            {live && queue.length > 1 && <Button onSelect={() => goChannel(1)}>Next channel</Button>}
            <Button onSelect={() => api.launch.vlc(req.filePath || req.url).then((r) => !r.ok && toast(r.error || 'VLC not available', 'error', 6000))}>Open in VLC</Button>
            <Button onSelect={close}>Back</Button>
          </div>
        </div>
      )}

      {/* volume / seek OSD */}
      {osd && <div className="pointer-events-none absolute right-[4rem] top-[3rem] rounded-xl bg-black/70 px-[1.6rem] py-[0.8rem] text-[1.6rem] font-semibold fade-in">{osd}</div>}
      {numBuf && <div className="pointer-events-none absolute right-[4rem] top-[3rem] rounded-xl bg-black/80 px-[2rem] py-[0.8rem] text-[3.4rem] font-bold tabular-nums">{numBuf}</div>}

      {/* up next */}
      {nextUp && (
        <div className="absolute bottom-[5rem] right-[4rem] z-20 flex items-center gap-[1.2rem] rounded-2xl glass p-[1.2rem]">
          <div className="text-[1.3rem]"><div className="text-[color:var(--muted)]">Up next in {nextCount}s</div><div className="clamp-1 max-w-[24rem] text-[1.5rem] font-bold">{nextUp.title}</div></div>
          <Button primary autoFocus onSelect={() => playMedia(nextUp)}>Play now</Button><Button onSelect={() => setNextUp(null)}>Cancel</Button>
        </div>
      )}

      {/* controls */}
      <div className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-[4rem] pb-[2.4rem] pt-[6rem] transition-opacity duration-300 ${controls && phase !== 'error' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="mb-[1rem] flex items-end gap-[1.4rem]">
          {live && ch && <div className="flex h-[5.5rem] w-[8.5rem] items-center justify-center overflow-hidden rounded-xl bg-white/10 p-[0.5rem]"><Art src={ch.logo} title={ch.name} fit="contain" className="h-full w-full" /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[0.8rem] text-[1.1rem] text-[color:var(--muted)]">
              {live && <span className="rounded bg-red-600 px-[0.5rem] py-[0.1rem] text-[0.8rem] font-bold text-white">LIVE</span>}
              <span>{req.subtitle}</span>
            </div>
            <div className="clamp-1 text-[2.4rem] font-bold text-shadow">{req.title}</div>
          </div>
          <div className="text-right text-[1.2rem] text-[color:var(--muted)]">{fmtClock(Date.now())}</div>
        </div>

        {live ? (
          <div className="mb-[1.2rem] grid grid-cols-2 gap-[2rem] text-[1.2rem]">
            <div>
              <div className="text-[0.95rem] font-bold uppercase tracking-wider text-accent-cyan">Now</div>
              {epg.now ? (<><div className="clamp-1 text-[1.4rem] font-semibold">{epg.now.title}</div><div className="my-[0.3rem] h-[0.3rem] overflow-hidden rounded bg-white/20"><div className="h-full bg-accent-purple" style={{ width: `${progPct}%` }} /></div><div className="clamp-2 text-white/60">{fmtClock(epg.now.start)} – {fmtClock(epg.now.stop)} · {epg.now.desc}</div></>) : <div className="text-white/50">No programme information</div>}
            </div>
            <div>
              <div className="text-[0.95rem] font-bold uppercase tracking-wider text-accent-cyan">Next</div>
              {epg.next ? (<><div className="clamp-1 text-[1.4rem] font-semibold">{epg.next.title}</div><div className="text-white/60">{fmtClock(epg.next.start)} – {fmtClock(epg.next.stop)}</div></>) : <div className="text-white/50">—</div>}
            </div>
          </div>
        ) : !isAudio || dur > 0 ? (
          <div data-pbar="" className="mb-[1rem] flex items-center gap-[1.2rem]">
            <span className="w-[5.5rem] text-right text-[1.2rem] tabular-nums">{fmtTime(time)}</span>
            <Focusable className="relative h-[1.1rem] flex-1 rounded-full bg-white/20 f-tile !rounded-full !border-0" onKey={(e) => { if (e.k === 'left') { seek(-10); return true; } if (e.k === 'right') { seek(10); return true; } }}>
              <div className="absolute inset-x-0 -inset-y-[0.9rem] z-10" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (dur) { videoRef.current!.currentTime = Math.max(0, Math.min(dur - 1, ((e.clientX - r.left) / r.width) * dur)); showControls(); } }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: dur ? `${(buffered / dur) * 100}%` : 0 }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-purple to-accent-blue" style={{ width: dur ? `${(time / dur) * 100}%` : 0 }} />
            </Focusable>
            <span className="w-[5.5rem] text-[1.2rem] tabular-nums">{fmtTime(dur)}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-[0.8rem]">
          {live ? (<><Button onSelect={() => goChannel(-1)} icon="⏮">CH −</Button><Button onSelect={() => goChannel(1)} icon="⏭">CH +</Button><Button onSelect={() => setMenu('channels')} icon="☰">Channels</Button></>) : (<><Button onSelect={() => seek(-10)} icon="⏪">10s</Button><Button onSelect={toggle} icon={paused ? '▶' : '⏸'} primary>{paused ? 'Play' : 'Pause'}</Button><Button onSelect={() => seek(30)} icon="⏩">30s</Button></>)}
          {live && <Button onSelect={toggle} icon={paused ? '▶' : '⏸'}>{paused ? 'Play' : 'Pause'}</Button>}
          {ch && <Button onSelect={() => toggleList('favorites', chanItem())} icon={isFav ? '★' : '☆'}>{isFav ? 'Favorited' : 'Favorite'}</Button>}
          <Button onSelect={() => setMenu('tracks')} icon="🎧">Audio &amp; Subtitles</Button>
          {!live && <Button onSelect={() => setMenu('speed')} icon="⏱">{speed}×</Button>}
          {!isAudio && <Button onSelect={() => { const v = videoRef.current as any; if (document.pictureInPictureElement) document.exitPictureInPicture(); else v?.requestPictureInPicture?.().catch(() => toast('Picture-in-picture is not available for this video.', 'error')); }} icon="🗗">PiP</Button>}
          <Button onSelect={() => setMuted(!!(videoRef.current!.muted = !videoRef.current!.muted))} icon={muted ? '🔇' : '🔊'}>{Math.round((muted ? 0 : vol) * 100)}%</Button>
          <div className="flex-1" />
          <Button onSelect={close} icon="✕">Close</Button>
        </div>
      </div>

      {/* menus */}
      {menu === 'speed' && (
        <Modal title="Playback speed" onClose={() => setMenu('')} width={34}>
          <div className="grid grid-cols-3 gap-[0.8rem]">
            {SPEEDS.map((s) => <Button key={s} autoFocus={s === speed} primary={s === speed} onSelect={() => { videoRef.current!.playbackRate = s; setSpeed(s); setMenu(''); }}>{s}×</Button>)}
          </div>
        </Modal>
      )}
      {menu === 'tracks' && (
        <Modal title="Audio & Subtitles" onClose={() => setMenu('')} width={64}>
          <div className="grid grid-cols-2 gap-[2rem]">
            <div>
              <div className="mb-[0.6rem] text-[1.1rem] font-bold uppercase tracking-wider text-accent-cyan">Audio</div>
              <div className="flex flex-col gap-[0.5rem]">
                {audioTracks.length === 0 && <div className="text-[1.1rem] text-white/50">Only one audio track available.</div>}
                {audioTracks.map((t) => (
                  <Focusable key={t.id} autoFocus={t.active} className={`f-tile px-[1.2rem] py-[0.7rem] text-[1.15rem] ${t.active ? '!border-accent-purple' : ''}`} onSelect={() => {
                    if (hlsRef.current) hlsRef.current.audioTrack = t.id; else { const at = (videoRef.current as any).audioTracks; for (let i = 0; i < at.length; i++) at[i].enabled = i === t.id; }
                    refreshAudio(); flash(`🎧 ${t.label}`);
                  }}>{t.active ? '✓ ' : ''}{t.label}</Focusable>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-[0.6rem] text-[1.1rem] font-bold uppercase tracking-wider text-accent-cyan">Subtitles</div>
              <div className="flex max-h-[26rem] flex-col gap-[0.5rem] overflow-y-auto">
                <Focusable autoFocus={audioTracks.length === 0} className={`f-tile px-[1.2rem] py-[0.7rem] text-[1.15rem] ${subId === 'off' ? '!border-accent-purple' : ''}`} onSelect={() => setSubId('off')}>{subId === 'off' ? '✓ ' : ''}Off</Focusable>
                {subSources.map((s) => <Focusable key={s.id} className={`f-tile px-[1.2rem] py-[0.7rem] text-[1.15rem] ${subId === s.id ? '!border-accent-purple' : ''}`} onSelect={() => setSubId(s.id)}><span className="clamp-1">{subId === s.id ? '✓ ' : ''}{s.label}</span></Focusable>)}
                <Focusable className="f-tile px-[1.2rem] py-[0.7rem] text-[1.15rem]" onSelect={loadSubFile}>＋ Load subtitle file (.srt / .vtt)…</Focusable>
              </div>
              <div className="mt-[1rem] flex items-center gap-[0.6rem] text-[1.1rem]">
                <span className="text-white/60">Sync</span>
                <Button onSelect={() => setSubDelay((d) => Math.round((d - 0.5) * 10) / 10)}>−0.5s</Button>
                <span className="w-[5rem] text-center tabular-nums">{subDelay > 0 ? '+' : ''}{subDelay}s</span>
                <Button onSelect={() => setSubDelay((d) => Math.round((d + 0.5) * 10) / 10)}>+0.5s</Button>
              </div>
              <div className="mt-[0.6rem] flex items-center gap-[0.6rem] text-[1.1rem]">
                <span className="text-white/60">Size</span>
                <Button onSelect={() => updateSettings({ subtitleSize: Math.max(0.6, Math.round((settings.subtitleSize - 0.1) * 10) / 10) })}>A−</Button>
                <span className="w-[5rem] text-center tabular-nums">{Math.round(settings.subtitleSize * 100)}%</span>
                <Button onSelect={() => updateSettings({ subtitleSize: Math.min(2, Math.round((settings.subtitleSize + 0.1) * 10) / 10) })}>A+</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {menu === 'channels' && live && (
        <Modal title="Channels" onClose={() => setMenu('')} width={48}>
          <div className="flex max-h-[62vh] flex-col gap-[0.5rem] overflow-y-auto" data-vscroll="">
            {queue.slice(Math.max(0, idx - 15), Math.max(0, idx - 15) + 150).map((c) => (
              <Focusable key={c.id} autoFocus={c.id === ch?.id} onSelect={() => { setMenu(''); playMedia(channelRequest(c, queue)); }} className={`f-tile flex items-center gap-[1rem] px-[1rem] py-[0.6rem] ${c.id === ch?.id ? '!border-accent-purple' : ''}`}>
                <span className="w-[3.5rem] text-right text-[1.1rem] tabular-nums text-white/50">{c.num}</span>
                <div className="h-[2.6rem] w-[4.2rem] shrink-0"><Art src={c.logo} title={c.name[0] || '?'} fit="contain" className="h-full w-full" /></div>
                <span className="clamp-1 text-[1.25rem]">{c.name}</span>{c.broken && <span className="ml-auto text-[0.9rem] text-amber-400">⚠ offline</span>}
              </Focusable>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
