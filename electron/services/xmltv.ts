// Lightweight XMLTV parser (regex based so it stays fast on very large guides).

export interface XmlProgramme { channel: string; start: number; stop: number; title: string; desc: string }

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

// XMLTV time: 20240131120000 +0800
export function parseXmltvTime(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(s.trim());
  if (!m) return NaN;
  const [, y, mo, d, h, mi, se = '00', tz = '+0000'] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  const sign = tz.startsWith('-') ? -1 : 1;
  const off = sign * (parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(3, 5), 10)) * 60000;
  return utc - off;
}

export function* parseXmltv(xml: string, fromMs: number, toMs: number): Generator<XmlProgramme> {
  const re = /<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const start = /start="([^"]+)"/.exec(attrs)?.[1];
    const stop = /stop="([^"]+)"/.exec(attrs)?.[1];
    const channel = /channel="([^"]+)"/.exec(attrs)?.[1];
    if (!start || !stop || !channel) continue;
    const s = parseXmltvTime(start); const e = parseXmltvTime(stop);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < fromMs || s > toMs) continue;
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(m[2])?.[1] ?? '';
    const desc = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(m[2])?.[1] ?? '';
    yield { channel: decode(channel), start: s, stop: e, title: decode(title) || 'Programme', desc: decode(desc) };
  }
}
