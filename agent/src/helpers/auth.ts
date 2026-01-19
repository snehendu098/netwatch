import Store from 'electron-store';
import { hashPassword, verifyPassword, isLegacyHash } from '../utils/password';
import { StoreSchema } from '../types';

/**
 * Verify admin password using secure PBKDF2
 * Also auto-migrates legacy SHA256 hashes to secure format
 */
export function verifyAdminPassword(store: Store<StoreSchema>, password: string): boolean {
  const storedHash = store.get('adminPasswordHash') as string;
  const isValid = verifyPassword(password, storedHash);

  // Auto-migrate legacy SHA256 hashes to secure format
  if (isValid && isLegacyHash(storedHash)) {
    const newHash = hashPassword(password);
    store.set('adminPasswordHash', newHash);
    console.log('[Auth] Password hash migrated to secure format');
  }

  return isValid;
}

/**
 * Update admin password (requires old password verification)
 */
export function updateAdminPassword(
  store: Store<StoreSchema>,
  oldPassword: string,
  newPassword: string
): boolean {
  if (!verifyAdminPassword(store, oldPassword)) {
    return false;
  }

  const newHash = hashPassword(newPassword);
  store.set('adminPasswordHash', newHash);
  return true;
}

/**
 * Set a new admin password (for initial setup)
 */
export function setAdminPassword(store: Store<StoreSchema>, password: string): void {
  const hash = hashPassword(password);
  store.set('adminPasswordHash', hash);
}
