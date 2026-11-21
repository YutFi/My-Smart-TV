export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export const fmtClock = (ms: number, h12 = true) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: h12 });
export const fmtDay = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
export function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
export const fmtRuntime = (min: number) => (min ? `${Math.floor(min / 60) ? Math.floor(min / 60) + 'h ' : ''}${min % 60}m` : '');
