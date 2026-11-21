import { CATEGORIES } from '../../shared/types';

export interface ParsedChannel {
  name: string; logo: string; group: string; category: string; url: string; tvgId: string; country: string;
  chno: number; catchup: string; catchupSource: string; catchupDays: number; ua: string; referrer: string;
}
export interface ParsedPlaylist { channels: ParsedChannel[]; epgUrls: string[] }

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out[m[1].toLowerCase()] = m[2];
  return out;
}

const RULES: [string, RegExp][] = [
  ['Malaysia TV', /malay|\bmy\b|astro|\brtm\b|\btv[123]\b|\bntv7\b|\b8tv\b|tv alhijrah|bernama|awani|\bmnc\b|\bhypp\b|sooka/i],
  ['Singapore TV', /singapore|\bsg\b|mediacorp|channel ?5|channel ?8|channel ?u|suria|vasantham|cna\b/i],
  ['Kids', /kid|child|cartoon|anime|junior|nick|disney|baby|boomerang|toon/i],
  ['Sports', /sport|football|soccer|golf|racing|nba|nfl|espn|bein|f1|tennis|cricket|fight|ufc|wwe|olympic/i],
  ['News', /news|cnn|bbc world|al jazeera|bloomberg|cnbc|sky news|dw\b|france ?24|euronews|nhk world|cna/i],
  ['Movies', /movie|cinema|film|hbo|cinemax|\bmovies?\b|drama|series/i],
  ['Documentary', /document|discovery|national geo|history|science|nature|animal|crime|wildlife/i],
  ['Music', /music|mtv|radio|vevo|hits|concert|karaoke/i],
  ['Religious', /relig|islam|quran|church|christian|catholic|bible|hindu|buddh|faith|gospel|muslim|makkah|madina|alhijrah/i],
  ['Educational', /educat|learn|school|university|academy|kuliah|pendidikan|knowledge|ted\b/i],
  ['Lifestyle', /lifestyle|food|cook|travel|fashion|home|garden|health|fitness|shop|tlc|living/i],
  ['Entertainment', /entertain|comedy|variety|reality|general|show|lifetime|e!|hiburan/i],
];

export function categorize(group: string, name: string, country: string): string {
  const g = group || '';
  const c = (country || '').toUpperCase();
  const hay = `${g} ${name}`;
  const isGenre = ([cat]: [string, RegExp]) => cat !== 'Malaysia TV' && cat !== 'Singapore TV';
  // Genre wins (group name first, then channel name). Country is a separate filter in the UI (country = MY/SG).
  for (const r of RULES.filter(isGenre)) if (r[1].test(g)) return r[0];
  for (const r of RULES.filter(isGenre)) if (r[1].test(hay)) return r[0];
  if (c === 'MY' || /malaysia/i.test(g)) return 'Malaysia TV';
  if (c === 'SG' || /singapore/i.test(g)) return 'Singapore TV';
  for (const r of RULES.filter((x) => !isGenre(x))) if (r[1].test(name)) return r[0];
  return (CATEGORIES as readonly string[]).includes(g) ? g : 'International';
}

export function parseM3U(text: string, countryHint = ''): ParsedPlaylist {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const out: ParsedChannel[] = [];
  const epgUrls: string[] = [];
  let cur: Partial<ParsedChannel> | null = null;
  let opt: { ua: string; referrer: string } = { ua: '', referrer: '' };
  let groupFromExt = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) {
      const a = attrs(line);
      const u = a['x-tvg-url'] || a['url-tvg'] || a['tvg-url'];
      if (u) epgUrls.push(...u.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (line.startsWith('#EXTINF')) {
      const a = attrs(line);
      const comma = line.lastIndexOf(',');
      const name = (comma >= 0 ? line.slice(comma + 1) : a['tvg-name'] || '').trim() || a['tvg-name'] || 'Channel';
      cur = {
        name,
        logo: a['tvg-logo'] || '',
        group: a['group-title'] || '',
        tvgId: a['tvg-id'] || '',
        country: (a['tvg-country'] || countryHint || (/astro|\brtm\b|\btv[123]\b|\bntv7\b|\b8tv\b|malaysia/i.test(name) ? 'MY' : '') || (/mediacorp|channel ?(5|8|u)\b|singapore/i.test(name) ? 'SG' : '')).split(/[;,]/)[0].toUpperCase(),
        chno: parseInt(a['tvg-chno'] || a['channel-number'] || '0', 10) || 0,
        catchup: a['catchup'] || a['catchup-type'] || '',
        catchupSource: a['catchup-source'] || '',
        catchupDays: parseInt(a['catchup-days'] || a['tvg-rec'] || '0', 10) || 0,
        ua: a['http-user-agent'] || '',
        referrer: a['http-referrer'] || '',
      };
      opt = { ua: '', referrer: '' };
      continue;
    }
    if (line.startsWith('#EXTGRP:')) { groupFromExt = line.slice(8).trim(); continue; }
    if (line.startsWith('#EXTVLCOPT:')) {
      const kv = line.slice(11);
      if (/^http-user-agent=/i.test(kv)) opt.ua = kv.split('=').slice(1).join('=');
      else if (/^http-referrer=/i.test(kv)) opt.referrer = kv.split('=').slice(1).join('=');
      continue;
    }
    if (line.startsWith('#')) continue;
    // a URL line
    if (/^(https?|rtmp|rtsp|udp|mms):\/\//i.test(line) || /\.(m3u8?|ts|mp4|mkv)(\?|$)/i.test(line)) {
      const c = cur || { name: line.split('/').pop() || 'Stream', logo: '', group: '', tvgId: '', country: countryHint, chno: 0, catchup: '', catchupSource: '', catchupDays: 0 };
      const group = c.group || groupFromExt;
      const [urlPart, pipeHeaders] = line.split('|');
      let ua = opt.ua || c.ua || ''; let referrer = opt.referrer || c.referrer || '';
      if (pipeHeaders) {
        const p = new URLSearchParams(pipeHeaders);
        ua = ua || p.get('User-Agent') || p.get('user-agent') || '';
        referrer = referrer || p.get('Referer') || p.get('referer') || '';
      }
      out.push({
        name: c.name!, logo: c.logo!, group, category: categorize(group, c.name!, c.country!), url: urlPart,
        tvgId: c.tvgId!, country: c.country!, chno: c.chno!, catchup: c.catchup!, catchupSource: c.catchupSource!,
        catchupDays: c.catchupDays!, ua, referrer,
      });
      cur = null; groupFromExt = '';
    }
  }
  return { channels: out, epgUrls };
}
