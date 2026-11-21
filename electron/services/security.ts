import crypto from 'node:crypto';
import { safeStorage } from 'electron';

// PINs are never stored in plain text: scrypt with a random per-PIN salt.
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `s1:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  if (!stored) return true;
  const [v, saltHex, hashHex] = stored.split(':');
  if (v !== 's1') return false;
  const hash = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// API keys are encrypted with Windows DPAPI (via Electron safeStorage) when available.
export function seal(secret: string): string {
  if (!secret) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(secret).toString('base64');
  return 'raw:' + Buffer.from(secret, 'utf8').toString('base64');
}

export function unseal(stored: string): string {
  if (!stored) return '';
  try {
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    if (stored.startsWith('raw:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  } catch { /* corrupted */ }
  return '';
}
