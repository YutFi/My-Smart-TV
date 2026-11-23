import { useRef, useState } from 'react';
import { Modal, Focusable } from './ui';
import { useKeys } from '../lib/nav';
import { play } from '../lib/sfx';

const ROWS_ABC = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm.-_'];
const ROWS_SYM = ['1234567890', '!@#$%^&*()', '-_=+[]{};:', '\'"\\|,.<>/?'];

export function OnScreenKeyboard({ title, initial = '', mode = 'text', onSubmit, onCancel, placeholder }: {
  title: string; initial?: string; mode?: 'text' | 'url' | 'pin' | 'number'; onSubmit: (v: string) => void; onCancel: () => void; placeholder?: string;
}) {
  const [val, setVal] = useState(initial);
  const [shift, setShift] = useState(false);
  const [sym, setSym] = useState(false);
  const physical = useRef(false);
  const maxLen = mode === 'pin' ? 4 : 400;
  const add = (c: string) => { play('type'); setVal((v) => (v.length < maxLen ? v + c : v)); };

  useKeys((e) => {
    if (e.k === 'char' && e.ev) { physical.current = true; if (mode === 'pin' || mode === 'number') { if (/\d/.test(e.ch)) add(e.ch); } else add(e.ch); return true; }
    if (e.k === 'space') { if (mode === 'text' || mode === 'url') { physical.current = physical.current || !!e.ev; add(' '); } return true; }
    if (e.k === 'backspace') { setVal((v) => v.slice(0, -1)); return true; }
    if (e.k === 'select' && physical.current) { onSubmit(val); return true; }
    if (['up', 'down', 'left', 'right'].includes(e.k)) physical.current = false;
    return false;
  });

  const keysFor = () => (mode === 'pin' || mode === 'number' ? ['123', '456', '789', '0'] : sym ? ROWS_SYM : ROWS_ABC);
  const rows = keysFor();
  const label = (c: string) => (shift && !sym ? c.toUpperCase() : c);

  return (
    <Modal title={title} onClose={onCancel} width={mode === 'pin' || mode === 'number' ? 30 : 62}>
      <div className="mb-[1.2rem] flex min-h-[4rem] items-center rounded-[0.8rem] border border-white/15 bg-black/40 px-[1.2rem] text-[1.8rem] tracking-wide">
        {val.length === 0 ? <span className="text-white/35">{placeholder || 'Type here…'}</span> : <span className="clamp-1">{mode === 'pin' ? '●'.repeat(val.length) : val}</span>}
        <span className="ml-[0.1rem] inline-block h-[2rem] w-[0.12rem] animate-pulse bg-white" />
      </div>
      <div className="flex flex-col items-center gap-[0.5rem]">
        {rows.map((r, ri) => (
          <div key={ri} className="flex gap-[0.5rem]">
            {r.split('').map((c) => (
              <Focusable key={c} silent autoFocus={ri === 0 && c === r[0]} onSelect={() => add(label(c))} className="f-key flex h-[3.6rem] w-[3.6rem] items-center justify-center text-[1.5rem] font-semibold">{label(c)}</Focusable>
            ))}
          </div>
        ))}
        {mode === 'pin' || mode === 'number' ? (
          <div className="mt-[0.5rem] flex gap-[0.5rem]">
            <Focusable onSelect={() => { play('delete'); setVal((v) => v.slice(0, -1)); }} className="f-key flex h-[3.6rem] w-[7rem] items-center justify-center text-[1.3rem]">⌫</Focusable>
            <Focusable onSelect={() => onSubmit(val)} className="f-key flex h-[3.6rem] w-[7rem] items-center justify-center bg-accent-purple/60 text-[1.3rem] font-bold">OK</Focusable>
          </div>
        ) : (
          <>
            {mode === 'url' && (
              <div className="flex gap-[0.5rem]">
                {['https://', 'http://', '.com', '.m3u', '.m3u8', '/', ':', '?', '&', '='].map((s) => (
                  <Focusable key={s} onSelect={() => add(s)} className="f-key flex h-[3.2rem] items-center justify-center px-[0.8rem] text-[1.1rem]">{s}</Focusable>
                ))}
              </div>
            )}
            <div className="mt-[0.3rem] flex gap-[0.5rem]">
              <Focusable onSelect={() => setShift((s) => !s)} className={`f-key flex h-[3.6rem] w-[5rem] items-center justify-center text-[1.4rem] ${shift ? '!bg-accent-purple/70' : ''}`}>⇧</Focusable>
              <Focusable onSelect={() => setSym((s) => !s)} className="f-key flex h-[3.6rem] w-[6rem] items-center justify-center text-[1.2rem]">{sym ? 'ABC' : '#+='}</Focusable>
              <Focusable onSelect={() => add(' ')} className="f-key flex h-[3.6rem] w-[15rem] items-center justify-center text-[1.2rem]">space</Focusable>
              <Focusable onSelect={() => { play('delete'); setVal((v) => v.slice(0, -1)); }} className="f-key flex h-[3.6rem] w-[5rem] items-center justify-center text-[1.4rem]">⌫</Focusable>
              <Focusable onSelect={() => setVal('')} className="f-key flex h-[3.6rem] w-[6rem] items-center justify-center text-[1.2rem]">Clear</Focusable>
              <Focusable onSelect={() => onSubmit(val)} className="f-key flex h-[3.6rem] w-[7rem] items-center justify-center bg-accent-purple/60 text-[1.3rem] font-bold">Done</Focusable>
            </div>
          </>
        )}
      </div>
      <div className="mt-[1rem] text-center text-[0.95rem] text-white/40">A physical keyboard also works — press Enter to confirm.</div>
    </Modal>
  );
}

export function TextField({ label, value, onChange, mode = 'text', placeholder, mask, fk }: { label: string; value: string; onChange: (v: string) => void; mode?: 'text' | 'url' | 'pin'; placeholder?: string; mask?: boolean; fk?: string }) {
  const [open, setOpen] = useState(false);
  const shown = mask && value ? '•'.repeat(Math.min(value.length, 24)) : value;
  return (
    <>
      <Focusable fk={fk} onSelect={() => setOpen(true)} className="f-tile flex items-center justify-between gap-[1.5rem] px-[1.4rem] py-[1rem] text-[1.2rem]">
        <span className="shrink-0 font-semibold">{label}</span>
        <span className={`clamp-1 text-right ${value ? 'text-accent-cyan' : 'text-white/35'}`}>{shown || placeholder || 'Not set'}</span>
      </Focusable>
      {open && <OnScreenKeyboard title={label} initial={mask ? '' : value} mode={mode} placeholder={placeholder} onCancel={() => setOpen(false)} onSubmit={(v) => { setOpen(false); onChange(v); }} />}
    </>
  );
}

// PIN prompt used for profile PINs and parental control
export function PinPrompt({ title, onVerify, onClose }: { title: string; onVerify: (pin: string) => Promise<boolean>; onClose: () => void }) {
  const [err, setErr] = useState('');
  return (
    <OnScreenKeyboard
      title={err ? `${title} — ${err}` : title} mode="pin" onCancel={onClose}
      onSubmit={async (v) => { if (v.length !== 4) { setErr('enter 4 digits'); return; } if (await onVerify(v)) onClose(); else setErr('wrong PIN'); }}
    />
  );
}
