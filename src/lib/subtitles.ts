export interface Cue { start: number; end: number; text: string }

const toSec = (t: string) => {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(t.trim());
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
};

// Parses SRT or WebVTT into cues (the player renders them itself so timing can be shifted live for sync).
export function parseSubtitles(src: string): Cue[] {
  const text = src.replace(/^﻿/, '').replace(/\r/g, '');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    const start = toSec(a); const end = toSec(b.trim().split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const body = lines.slice(ti + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

export function cueAt(cues: Cue[], t: number): Cue | null {
  // binary search for the last cue starting <= t
  let lo = 0; let hi = cues.length - 1; let idx = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  for (let i = idx; i >= 0 && i > idx - 4; i--) if (cues[i].end >= t) return cues[i];
  return null;
}
