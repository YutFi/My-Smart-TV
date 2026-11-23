import { useEffect, useRef } from 'react';
import { mediaUrl } from '../lib/api';
import { playerStore, useApp } from '../lib/app';
import { useStore } from '../lib/store';
import { splashStore } from '../lib/splash';
import { FACTORY, type SceneName } from '../lib/scenes';
import { AmbientBackground } from './Effects';

// The live wallpaper behind the whole interface: the default aurora + drifting lights, any animated scene, or a picture /
// looping video you chose. Everything pauses while a video, game or splash owns the screen so it never costs frames.
function SceneCanvas({ scene, paused }: { scene: SceneName; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (paused) return;
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const k = 0.5; // half resolution is plenty for a backdrop and keeps the GPU cool
    const resize = () => { cv.width = Math.floor(window.innerWidth * k); cv.height = Math.floor(window.innerHeight * k); };
    resize(); window.addEventListener('resize', resize);
    const s = FACTORY[scene]();
    let raf = 0; let last = performance.now(); const t0 = last; let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
      if (document.hidden || acc < 1 / 30) return; // ~30 fps
      s.draw(ctx, cv.width, cv.height, (now - t0) / 1000, acc); acc = 0;
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [scene, paused]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

function VideoWallpaper({ file, paused }: { file: string; paused: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const v = ref.current; if (!v) return; if (paused) v.pause(); else v.play().catch(() => undefined); }, [paused]);
  return <video ref={ref} src={mediaUrl(file)} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" />;
}

export function Wallpaper() {
  const { settings } = useApp();
  const { req } = useStore(playerStore);
  const { info } = useStore(splashStore);
  const paused = !!req || !!info;
  const kind = settings.wallpaper;
  if (kind === 'default') return <><div className="aurora"><i /><i /><i /></div><AmbientBackground /></>;
  const dim = Math.max(0, Math.min(0.85, settings.wallpaperDim));
  return (
    <>
      {kind === 'image' && settings.wallpaperFile && <img src={mediaUrl(settings.wallpaperFile)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ animation: 'kenburns 40s ease-in-out infinite alternate' }} />}
      {kind === 'video' && settings.wallpaperFile && <VideoWallpaper file={settings.wallpaperFile} paused={paused} />}
      {kind !== 'image' && kind !== 'video' && <SceneCanvas scene={kind as SceneName} paused={paused} />}
      {/* legibility: adjustable dimming plus a soft vignette */}
      <div className="absolute inset-0" style={{ background: `rgba(3,4,12,${dim})` }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.45))' }} />
    </>
  );
}
