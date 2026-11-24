import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { play } from '../lib/sfx';
import { pushScope, popScope, registerElementKeys, useKeys, type KeyEv } from '../lib/nav';

// ---------- Focusable ----------
export interface FocusableProps {
  className?: string; style?: CSSProperties; children?: ReactNode; onSelect?: () => void; onKey?: (e: KeyEv) => boolean | void;
  fk?: string; autoFocus?: boolean; disabled?: boolean; onFocus?: () => void; title?: string; tag?: 'div' | 'button'; silent?: boolean; tile?: boolean;
}
export function Focusable({ className = '', style, children, onSelect, onKey, fk, autoFocus, disabled, onFocus, title, silent, tile }: FocusableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hold = useRef<{ timer?: number; fired: boolean }>({ fired: false });
  useEffect(() => { registerElementKeys(ref.current, onKey || null); return () => registerElementKeys(ref.current, null); });
  // tiles: press and hold (touch, touchpad, air mouse) opens the tile menu, same as the Menu key or right-click
  const startHold = () => { if (!tile || !onKey) return; hold.current.fired = false; window.clearTimeout(hold.current.timer); hold.current.timer = window.setTimeout(() => { hold.current.fired = true; onKey({ k: 'menu', ch: '', ev: null, repeat: false }); }, 700); };
  const endHold = () => window.clearTimeout(hold.current.timer);
  return (
    <div
      ref={ref} data-f="" data-fk={fk} data-autofocus={autoFocus ? '' : undefined} data-disabled={disabled ? '' : undefined} data-silent={silent ? '' : undefined} data-tile={tile ? '' : undefined}
      tabIndex={-1} role="button" aria-label={title} className={className} style={style} onFocus={onFocus}
      onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
      onClick={(e) => { if (hold.current.fired) { hold.current.fired = false; e.stopPropagation(); return; } if (!disabled) { e.stopPropagation(); onSelect?.(); } }}
    >{children}</div>
  );
}

export function Button({ children, onSelect, icon, primary, className = '', ...rest }: { children?: ReactNode; onSelect?: () => void; icon?: ReactNode; primary?: boolean; className?: string; fk?: string; autoFocus?: boolean; disabled?: boolean; onKey?: FocusableProps['onKey'] }) {
  return (
    <Focusable onSelect={onSelect} {...rest} className={`f-btn flex items-center justify-center gap-[0.7rem] px-[1.8rem] py-[0.8rem] text-[1.25rem] font-semibold whitespace-nowrap ${primary ? 'bg-gradient-to-r from-accent-purple to-accent-blue !border-transparent' : ''} ${rest.disabled ? 'opacity-40' : ''} ${className}`}>
      {icon && <span className="text-[1.4rem] leading-none">{icon}</span>}{children}
    </Focusable>
  );
}

// ---------- Art (poster/logo with graceful fallback) ----------
function hue(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
export function Art({ src, title, className = '', fit = 'cover', style, quiet }: { src?: string; title: string; className?: string; fit?: 'cover' | 'contain'; style?: CSSProperties; quiet?: boolean }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  const h = hue(title);
  if (!src || bad) {
    return (
      <div className={`flex items-center justify-center text-center p-[0.8rem] ${className}`} style={{ background: `linear-gradient(135deg, hsl(${h} 60% 32%), hsl(${(h + 50) % 360} 65% 16%))`, ...style }}>
        {!quiet && <span className="font-bold leading-tight text-white/90 clamp-3 text-[1.1rem] text-shadow">{title}</span>}
      </div>
    );
  }
  return <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBad(true)} className={className} style={{ objectFit: fit, ...style }} />;
}

// ---------- Cards ----------
export interface CardProps {
  title: string; sub?: string; image?: string; onSelect?: () => void; fk?: string; autoFocus?: boolean;
  shape?: 'poster' | 'wide' | 'logo' | 'square'; progress?: number; badge?: string; live?: boolean; broken?: boolean;
  onKey?: FocusableProps['onKey']; fit?: 'cover' | 'contain'; width?: number; icon?: ReactNode;
}
export function Card({ title, sub, image, onSelect, fk, autoFocus, shape = 'poster', progress, badge, live, broken, onKey, fit, width, icon }: CardProps) {
  const w = width ?? (shape === 'poster' ? 13.5 : shape === 'wide' ? 23 : shape === 'logo' ? 14 : 13);
  const aspect = shape === 'poster' ? '2 / 3' : shape === 'wide' ? '16 / 9' : shape === 'logo' ? '16 / 10' : '1 / 1';
  return (
    <div className="shrink-0 py-[0.9rem] px-[0.55rem]" style={{ width: `${w + 1.1}rem` }}>
      <Focusable fk={fk} autoFocus={autoFocus} onSelect={onSelect} onKey={onKey} className="f-card relative block overflow-hidden rounded-[0.9rem] bg-ink-700" style={{ width: `${w}rem`, aspectRatio: aspect }}>
        {shape === 'logo' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-ink-600 to-ink-800 p-[1.4rem]">
            <Art src={image} title={title} fit="contain" quiet={!!icon} className="max-h-full max-w-full" style={{ width: '100%', height: '100%' }} />
          </div>
        ) : <Art src={image} title={title} fit={fit} quiet={!!icon} className="absolute inset-0 h-full w-full" />}
        {icon && <div className="absolute inset-0 flex items-center justify-center text-[3rem]">{icon}</div>}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-[0.8rem] pb-[0.7rem] pt-[2.2rem]">
          <div className="clamp-1 text-[1.05rem] font-semibold text-white">{title}</div>
          {sub && <div className="clamp-1 text-[0.85rem] text-white/65">{sub}</div>}
        </div>
        {badge && <div className="absolute left-[0.6rem] top-[0.6rem] rounded-md bg-black/70 px-[0.5rem] py-[0.15rem] text-[0.75rem] font-bold text-white">{badge}</div>}
        {live && <div className="absolute right-[0.6rem] top-[0.6rem] flex items-center gap-[0.3rem] rounded-md bg-red-600 px-[0.5rem] py-[0.15rem] text-[0.7rem] font-bold text-white"><i className="h-[0.4rem] w-[0.4rem] rounded-full bg-white" />LIVE</div>}
        {broken && <div className="absolute right-[0.6rem] top-[0.6rem] rounded-md bg-amber-500 px-[0.5rem] py-[0.15rem] text-[0.7rem] font-bold text-black">⚠ OFFLINE</div>}
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-[0.35rem] bg-white/25"><div className="h-full bg-accent-purple" style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>
        )}
      </Focusable>
    </div>
  );
}

// ---------- Row ----------
export function Row({ title, children, action, id, subtitle }: { title: string; children: ReactNode; action?: ReactNode; id?: string; subtitle?: string }) {
  return (
    <section data-row={id || title} className="mb-[0.8rem] page-enter">
      <div className="mb-[0.1rem] flex items-end gap-[1rem] px-[3.5rem]">
        <h2 className="text-[1.7rem] font-bold tracking-tight text-white text-shadow">{title}</h2>
        {subtitle && <span className="pb-[0.25rem] text-[1rem] text-[color:var(--muted)]">{subtitle}</span>}
        {action}
      </div>
      <div data-hscroll="" className="hscroll px-[3rem]">{children}</div>
    </section>
  );
}

// ---------- states ----------
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex flex-col items-center justify-center gap-[1rem] p-[4rem] text-[1.2rem] text-[color:var(--muted)]"><div className="spinner" />{label}</div>;
}

export function EmptyState({ icon = '📭', title, message, actions }: { icon?: string; title: string; message?: string; actions?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[56rem] flex-col items-center gap-[1rem] px-[3rem] py-[3rem] text-center fade-in">
      <div className="text-[4.5rem]">{icon}</div>
      <div className="text-[2rem] font-bold">{title}</div>
      {message && <div className="text-[1.2rem] leading-relaxed text-[color:var(--muted)]">{message}</div>}
      {actions && <div className="mt-[0.8rem] flex flex-wrap justify-center gap-[1rem]">{actions}</div>}
    </div>
  );
}

export function Pill({ children, active, onSelect, fk, autoFocus }: { children: ReactNode; active?: boolean; onSelect?: () => void; fk?: string; autoFocus?: boolean }) {
  return (
    <Focusable fk={fk} autoFocus={autoFocus} onSelect={onSelect} className={`f-btn px-[1.3rem] py-[0.55rem] text-[1.1rem] font-semibold whitespace-nowrap ${active ? '!bg-accent-purple/60 !border-accent-purple' : ''}`}>{children}</Focusable>
  );
}

// ---------- Modal ----------
export function Modal({ title, children, onClose, width = 52, footer }: { title?: string; children: ReactNode; onClose: () => void; width?: number; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current!; pushScope(el); play('open'); return () => { popScope(el); play('close'); }; }, []);
  useKeys((e) => { if (e.k === 'back' || e.k === 'backspace') { onClose(); return true; } }, true);
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm fade-in">
      <div className="glass page-enter max-h-[88vh] overflow-y-auto rounded-[1.4rem] p-[2.2rem]" style={{ width: `${width}rem`, maxWidth: '94vw' }}>
        {title && <h2 className="mb-[1.2rem] text-[2rem] font-bold">{title}</h2>}
        {children}
        {footer && <div className="mt-[1.6rem] flex justify-end gap-[1rem]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ title, message, confirmLabel = 'Confirm', onConfirm, onClose, danger }: { title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void; danger?: boolean }) {
  return (
    <Modal title={title} onClose={onClose} width={44} footer={<>
      <Button onSelect={onClose} autoFocus>Cancel</Button>
      <Button onSelect={() => { onConfirm(); onClose(); }} primary={!danger} className={danger ? '!bg-red-600 !border-red-500' : ''}>{confirmLabel}</Button>
    </>}>
      <p className="text-[1.25rem] leading-relaxed text-[color:var(--muted)]">{message}</p>
    </Modal>
  );
}

// Picker: choose one option from a list (remote friendly alternative to <select>)
export function Picker<T extends string | number>({ title, options, value, onPick, onClose }: { title: string; options: { value: T; label: string; sub?: string }[]; value: T; onPick: (v: T) => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width={44}>
      <div className="flex max-h-[60vh] flex-col gap-[0.6rem] overflow-y-auto" data-vscroll="">
        {options.map((o) => (
          <Focusable key={String(o.value)} autoFocus={o.value === value} onSelect={() => { onPick(o.value); onClose(); }} className={`f-tile flex items-center justify-between px-[1.4rem] py-[1rem] text-[1.25rem] ${o.value === value ? '!border-accent-purple' : ''}`}>
            <span><span className="font-semibold">{o.label}</span>{o.sub && <span className="ml-[0.8rem] text-[1rem] text-[color:var(--muted)]">{o.sub}</span>}</span>
            {o.value === value && <span className="text-accent-cyan">✓</span>}
          </Focusable>
        ))}
      </div>
    </Modal>
  );
}
