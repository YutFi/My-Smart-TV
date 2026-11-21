import { useState } from 'react';
import { api } from '../lib/api';
import { appStore, reloadProfiles, toast, loadLists, updateSettings } from '../lib/app';
import { Button, Focusable, Modal, Pill } from './ui';
import { TextField, PinPrompt } from './osk';
import { ChoiceRow, ToggleRow } from './controls';
import { AVATARS, AVATAR_COLORS, CATEGORIES, type Profile } from '../../shared/types';

export async function chooseProfile(p: Profile) {
  appStore.set({ profile: p });
  updateSettings({ lastProfileId: p.id });
  await loadLists();
}

export function ProfilePicker({ onDone, onManage, canCancel, onCancel }: { onDone: () => void; onManage?: () => void; canCancel?: boolean; onCancel?: () => void }) {
  const profiles = appStore.get().profiles;
  const [pin, setPin] = useState<Profile | null>(null);
  const pick = async (p: Profile) => { if (p.hasPin) { setPin(p); return; } await chooseProfile(p); onDone(); };
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-[3rem] bg-cinema fade-in">
      <div className="aurora"><i /><i /><i /></div>
      <h1 className="relative text-[3.4rem] font-black tracking-tight">Who’s watching?</h1>
      <div className="relative flex flex-wrap justify-center gap-[2.2rem]">
        {profiles.map((p, i) => (
          <Focusable key={p.id} fk={`prof:${p.id}`} autoFocus={i === 0 || p.id === appStore.get().settings.lastProfileId} onSelect={() => pick(p)} className="f-card flex w-[12rem] flex-col items-center gap-[0.8rem] rounded-[1.2rem] p-[0.6rem]">
            <div className="relative flex h-[10rem] w-[10rem] items-center justify-center rounded-[1.4rem] text-[5rem] shadow-xl" style={{ background: `linear-gradient(135deg, ${p.color}, #0b1030)` }}>{p.avatar}{p.hasPin && <span className="absolute bottom-[0.4rem] right-[0.5rem] text-[1.5rem]">🔒</span>}</div>
            <div className="text-[1.5rem] font-semibold">{p.name}</div>{p.kids && <div className="-mt-[0.5rem] rounded bg-amber-400 px-[0.5rem] text-[0.85rem] font-bold text-black">KIDS</div>}
          </Focusable>
        ))}
      </div>
      <div className="relative flex gap-[1rem]">{onManage && <Button onSelect={onManage}>Manage profiles</Button>}{canCancel && <Button onSelect={onCancel}>Cancel</Button>}</div>
      {pin && <PinPrompt title={`PIN for ${pin.name}`} onClose={() => setPin(null)} onVerify={async (v) => { if (await api.profiles.verifyPin(pin.id, v)) { await chooseProfile(pin); onDone(); return true; } return false; }} />}
    </div>
  );
}

export function ProfileEditor({ profile, onClose }: { profile?: Profile; onClose: () => void }) {
  const [name, setName] = useState(profile?.name || '');
  const [avatar, setAvatar] = useState(profile?.avatar || AVATARS[0]);
  const [color, setColor] = useState(profile?.color || AVATAR_COLORS[0]);
  const [kids, setKids] = useState(profile?.kids || false);
  const [rating, setRating] = useState(profile?.maxRating || 'all');
  const [blocked, setBlocked] = useState<string[]>(profile?.blockedCategories || []);
  const [pin, setPin] = useState<string | null | undefined>(undefined); // undefined = unchanged, null = remove
  const [pinAsk, setPinAsk] = useState(false);
  const save = async () => {
    if (!name.trim()) { toast('Give the profile a name', 'error'); return; }
    await api.profiles.save({ id: profile?.id, name: name.trim(), avatar, color, kids, maxRating: kids && rating === 'all' ? 'PG' : rating, blockedCategories: blocked, pin });
    await reloadProfiles(); toast('Profile saved', 'ok'); onClose();
  };
  const hasPinNow = pin === undefined ? !!profile?.hasPin : pin !== null;
  return (
    <Modal title={profile ? `Edit ${profile.name}` : 'New profile'} onClose={onClose} width={64}
      footer={<><Button onSelect={onClose}>Cancel</Button>{profile && <Button className="!text-red-300" onSelect={async () => { try { await api.profiles.remove(profile.id); await reloadProfiles(); onClose(); } catch (e: any) { toast(e.message, 'error'); } }}>Delete</Button>}<Button primary onSelect={save}>Save</Button></>}>
      <div className="flex flex-col gap-[0.7rem]">
        <TextField label="Name" value={name} onChange={setName} placeholder="Profile name" />
        <div className="flex flex-wrap gap-[0.5rem] py-[0.3rem]">{AVATARS.map((a) => <Focusable key={a} onSelect={() => setAvatar(a)} className={`f-tile flex h-[3.8rem] w-[3.8rem] items-center justify-center text-[2rem] ${a === avatar ? '!border-accent-purple !bg-accent-purple/30' : ''}`}>{a}</Focusable>)}</div>
        <div className="flex gap-[0.5rem] pb-[0.3rem]">{AVATAR_COLORS.map((c) => <Focusable key={c} onSelect={() => setColor(c)} className={`f-tile h-[2.6rem] w-[2.6rem] ${c === color ? '!border-white' : ''}`} style={{ background: c }} />)}</div>
        <ToggleRow label="Kids profile" desc="Only family-friendly channel categories, titles rated PG or lower, and no YouTube, Sports or Apps." value={kids} onChange={setKids} />
        <ChoiceRow label="Highest allowed rating" value={rating} onChange={setRating} options={[{ value: 'all', label: 'No limit' }, { value: 'G', label: 'G' }, { value: 'PG', label: 'PG' }, { value: 'PG-13', label: 'PG-13' }, { value: 'R', label: 'R' }]} />
        <div><div className="mb-[0.4rem] px-[0.4rem] text-[1rem] font-bold uppercase tracking-widest text-accent-cyan">Blocked live-TV categories</div>
          <div className="flex flex-wrap gap-[0.4rem]">{CATEGORIES.map((c) => <Pill key={c} active={blocked.includes(c)} onSelect={() => setBlocked((b) => (b.includes(c) ? b.filter((x) => x !== c) : [...b, c]))}>{blocked.includes(c) ? '🚫 ' : ''}{c}</Pill>)}</div></div>
        <div className="flex items-center gap-[0.8rem] pt-[0.4rem]"><Button icon="🔒" onSelect={() => setPinAsk(true)}>{hasPinNow ? 'Change profile PIN' : 'Set profile PIN'}</Button>{hasPinNow && <Button onSelect={() => setPin(null)}>Remove PIN</Button>}<span className="text-[1rem] text-white/50">A PIN is required to open this profile.</span></div>
      </div>
      {pinAsk && <PinPrompt title="New 4-digit PIN" onClose={() => setPinAsk(false)} onVerify={async (v) => { setPin(v); return true; }} />}
    </Modal>
  );
}
