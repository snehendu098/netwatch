import { describe, it, expect, beforeAll } from 'vitest';

// Set encryption key before importing module
beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars!!';
});

describe('Encryption Utilities', () => {
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', async () => {
      const { encrypt, decrypt } = await import('@/lib/encryption');

      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', async () => {
      const { encrypt } = await import('@/lib/encryption');

      const plaintext = 'Test message';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle special characters', async () => {
      const { encrypt, decrypt } = await import('@/lib/encryption');

      const plaintext = '日本語テスト 🔐 <script>alert("xss")</script>';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', async () => {
      const { encrypt, decrypt } = await import('@/lib/encryption');

      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce encrypted data in correct format', async () => {
      const { encrypt } = await import('@/lib/encryption');

      const encrypted = encrypt('test');
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);
      // Each part should be valid base64
      parts.forEach(part => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });

    it('should throw error for invalid encrypted data format', async () => {
      const { decrypt } = await import('@/lib/encryption');

      expect(() => decrypt('invalid')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('a:b')).toThrow('Invalid encrypted data format');
    });
  });

  describe('hashPassword and verifyPassword', () => {
    it('should hash and verify password correctly', async () => {
      const { hashPassword, verifyPassword } = await import('@/lib/encryption');

      const password = 'mySecurePassword123!';
      const hash = hashPassword(password);

      expect(verifyPassword(password, hash)).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const { hashPassword, verifyPassword } = await import('@/lib/encryption');

      const password = 'correctPassword';
      const hash = hashPassword(password);

      expect(verifyPassword('wrongPassword', hash)).toBe(false);
    });

    it('should produce different hashes for same password (random salt)', async () => {
      const { hashPassword } = await import('@/lib/encryption');

      const password = 'samePassword';
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle special characters in password', async () => {
      const { hashPassword, verifyPassword } = await import('@/lib/encryption');

      const password = 'P@$$w0rd!🔒';
      const hash = hashPassword(password);

      expect(verifyPassword(password, hash)).toBe(true);
    });

    it('should return false for malformed hash', async () => {
      const { verifyPassword } = await import('@/lib/encryption');

      expect(verifyPassword('password', 'invalid-hash')).toBe(false);
      expect(verifyPassword('password', '')).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate token of specified length', async () => {
      const { generateToken } = await import('@/lib/encryption');

      const token16 = generateToken(16);
      const token32 = generateToken(32);
      const token64 = generateToken(64);

      // Hex encoding doubles the length
      expect(token16).toHaveLength(32);
      expect(token32).toHaveLength(64);
      expect(token64).toHaveLength(128);
    });

    it('should generate unique tokens', async () => {
      const { generateToken } = await import('@/lib/encryption');

      const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
      expect(tokens.size).toBe(100);
    });

    it('should only contain hex characters', async () => {
      const { generateToken } = await import('@/lib/encryption');

      const token = generateToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('sha256', () => {
    it('should produce consistent hash for same input', async () => {
      const { sha256 } = await import('@/lib/encryption');

      const hash1 = sha256('test');
      const hash2 = sha256('test');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', async () => {
      const { sha256 } = await import('@/lib/encryption');

      const hash1 = sha256('test1');
      const hash2 = sha256('test2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex string', async () => {
      const { sha256 } = await import('@/lib/encryption');

      const hash = sha256('anything');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask middle characters', async () => {
      const { maskSensitiveData } = await import('@/lib/encryption');

      const masked = maskSensitiveData('mySecretPassword');

      expect(masked.startsWith('myS')).toBe(true);
      expect(masked.endsWith('ord')).toBe(true);
      expect(masked).toContain('*');
    });

    it('should fully mask short strings', async () => {
      const { maskSensitiveData } = await import('@/lib/encryption');

      const masked = maskSensitiveData('abc');

      expect(masked).toBe('***');
    });

    it('should respect custom visible char count', async () => {
      const { maskSensitiveData } = await import('@/lib/encryption');

      const masked = maskSensitiveData('creditcard1234', 4);

      expect(masked.startsWith('cred')).toBe(true);
      expect(masked.endsWith('1234')).toBe(true);
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted data', async () => {
      const { encrypt, isEncrypted } = await import('@/lib/encryption');

      const encrypted = encrypt('test');

      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plaintext', async () => {
      const { isEncrypted } = await import('@/lib/encryption');

      expect(isEncrypted('plaintext')).toBe(false);
      expect(isEncrypted('not:encrypted')).toBe(false);
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('ensureEncrypted', () => {
    it('should encrypt plaintext', async () => {
      const { ensureEncrypted, isEncrypted } = await import('@/lib/encryption');

      const result = ensureEncrypted('plaintext');

      expect(isEncrypted(result)).toBe(true);
    });

    it('should not double-encrypt already encrypted data', async () => {
      const { encrypt, ensureEncrypted, decrypt } = await import('@/lib/encryption');

      const encrypted = encrypt('secret');
      const result = ensureEncrypted(encrypted);

      // Should be able to decrypt in one step
      expect(decrypt(result)).toBe('secret');
    });
  });

  describe('safeDecrypt', () => {
    it('should decrypt encrypted data', async () => {
      const { encrypt, safeDecrypt } = await import('@/lib/encryption');

      const encrypted = encrypt('secret');

      expect(safeDecrypt(encrypted)).toBe('secret');
    });

    it('should return plaintext as-is', async () => {
      const { safeDecrypt } = await import('@/lib/encryption');

      expect(safeDecrypt('plaintext')).toBe('plaintext');
    });

    it('should return data as-is if decryption fails', async () => {
      const { safeDecrypt } = await import('@/lib/encryption');

      // This looks like encrypted format but isn't valid
      const fakeEncrypted = 'YWJj:ZGVm:Z2hp';

      expect(safeDecrypt(fakeEncrypted)).toBe(fakeEncrypted);
    });
  });
});
