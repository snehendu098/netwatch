import * as crypto from 'crypto';

const SALT_LENGTH = 32;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

/**
 * Hash a password using PBKDF2 with a random salt
 * Format: salt:hash (both hex encoded)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');

  // Handle legacy SHA256 hashes (no salt separator)
  if (parts.length === 1) {
    // Legacy format - single SHA256 hash
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    return inputHash === storedHash;
  }

  // New format with salt
  if (parts.length !== 2) {
    return false;
  }

  const [salt, hash] = parts;
  const verifyHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Check if a hash is in the legacy SHA256 format
 */
export function isLegacyHash(storedHash: string): boolean {
  return !storedHash.includes(':');
}

/**
 * Migrate a legacy hash to the new format (requires knowing the password)
 */
export function migrateLegacyHash(password: string, legacyHash: string): string | null {
  // Verify the password matches the legacy hash first
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  if (inputHash !== legacyHash) {
    return null;
  }

  // Create new secure hash
  return hashPassword(password);
}
