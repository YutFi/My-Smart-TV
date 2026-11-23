import { useState, type ReactNode } from 'react';
import { Focusable, Picker } from './ui';
import { play } from '../lib/sfx';

export function SettingRow({ label, desc, right, onSelect, onKey, fk, autoFocus, silent }: { label: string; desc?: string; right?: ReactNode; onSelect?: () => void; onKey?: (e: any) => boolean | void; fk?: string; autoFocus?: boolean; silent?: boolean }) {
  return (
    <Focusable fk={fk} silent={silent} autoFocus={autoFocus} onSelect={onSelect} onKey={onKey} className="f-tile flex items-center justify-between gap-[2rem] px-[1.5rem] py-[0.95rem]">
      <div className="min-w-0"><div className="text-[1.3rem] font-semibold">{label}</div>{desc && <div className="mt-[0.1rem] text-[1rem] leading-snug text-white/50">{desc}</div>}</div>
      <div className="shrink-0 text-[1.2rem] text-accent-cyan">{right}</div>
    </Focusable>
  );
}

export function ToggleRow({ label, desc, value, onChange, autoFocus }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; autoFocus?: boolean }) {
  return (
    <SettingRow label={label} desc={desc} autoFocus={autoFocus} silent onSelect={() => { play(value ? 'off' : 'on'); onChange(!value); }} onKey={(e) => { if (e.k === 'left') { if (value) play('off'); onChange(false); return true; } if (e.k === 'right') { if (!value) play('on'); onChange(true); return true; } }}
      right={<span className={`relative inline-block h-[1.9rem] w-[3.6rem] rounded-full transition-colors ${value ? 'bg-accent-purple' : 'bg-white/25'}`}><i className="absolute top-[0.2rem] h-[1.5rem] w-[1.5rem] rounded-full bg-white transition-all" style={{ left: value ? '1.9rem' : '0.2rem' }} /></span>} />
  );
}

export function ChoiceRow<T extends string | number>({ label, desc, value, options, onChange, autoFocus }: { label: string; desc?: string; value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void; autoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <SettingRow label={label} desc={desc} autoFocus={autoFocus} onSelect={() => setOpen(true)} right={<span>{cur?.label ?? String(value)} ›</span>}
        onKey={(e) => { const i = options.findIndex((o) => o.value === value); if (e.k === 'left' && i > 0) { onChange(options[i - 1].value); return true; } if (e.k === 'right' && i < options.length - 1) { onChange(options[i + 1].value); return true; } }} />
      {open && <Picker title={label} options={options} value={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SliderRow({ label, desc, value, min, max, step, fmt, onChange }: { label: string; desc?: string; value: number; min: number; max: number; step: number; fmt?: (v: number) => string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  const set = (v: number) => { play('tick'); onChange(Math.round(Math.max(min, Math.min(max, v)) / step) * step); };
  return (
    <SettingRow label={label} desc={desc} silent onSelect={() => set(value + step > max ? min : value + step)}
      onKey={(e) => { if (e.k === 'left') { set(value - step); return true; } if (e.k === 'right') { set(value + step); return true; } }}
      right={<span className="flex items-center gap-[1rem]"><span className="relative h-[0.5rem] w-[16rem] rounded-full bg-white/20"><i className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-purple to-accent-blue" style={{ width: `${pct}%` }} /><i className="absolute top-1/2 h-[1.3rem] w-[1.3rem] -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `calc(${pct}% - 0.65rem)` }} /></span><span className="w-[5rem] text-right tabular-nums">{fmt ? fmt(value) : value}</span></span>} />
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-[0.1rem] mt-[1.2rem] px-[0.4rem] text-[1rem] font-bold uppercase tracking-[0.2em] text-accent-cyan first:mt-0">{children}</h3>;
}
