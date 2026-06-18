/**
 * FIELD-LEVEL ENCRYPTION
 * ─────────────────────────────────────────────
 * Encrypts sensitive database fields at the
 * application layer using AES-256-GCM.
 *
 * Fields encrypted:
 *   - National ID / Ghana Card numbers
 *   - Bank account references
 *   - Any PII marked sensitive
 *
 * The encryption key lives in the environment
 * variable ENCRYPTION_KEY (64 hex chars = 32 bytes)
 *
 * Generate a key:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * ─────────────────────────────────────────────
 */

import crypto from 'crypto';

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12;   // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be set in .env as a 64-character hex string. ' +
      'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
}

// ─────────────────────────────────────────────
// ENCRYPT
// Returns: iv:authTag:ciphertext (all hex, colon-separated)
// ─────────────────────────────────────────────
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  cipher.setAAD(Buffer.from(process.env.APP_NAME ?? 'app'));  // Additional auth data

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

// ─────────────────────────────────────────────
// DECRYPT
// ─────────────────────────────────────────────
export function decrypt(ciphertext: string): string {
  const key   = getKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format — expected iv:tag:data');
  }

  const [ivHex, tagHex, dataHex] = parts;
  const iv        = Buffer.from(ivHex,  'hex');
  const tag       = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex,'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from(process.env.APP_NAME ?? 'app'));

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

// ─────────────────────────────────────────────
// SAFE HELPERS — return null instead of throwing
// ─────────────────────────────────────────────
export function encryptSafe(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return encrypt(value); }
  catch { return null; }
}

export function decryptSafe(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return decrypt(value); }
  catch { return null; }
}

// ─────────────────────────────────────────────
// HASH — one-way hash for searchable fields
// Use when you need to search by national ID
// without storing it in plaintext
// ─────────────────────────────────────────────
export function hashField(value: string): string {
  const salt = process.env.HASH_SALT;
  if (!salt) {
    throw new Error(
      'HASH_SALT must be set in environment. ' +
      'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return crypto
    .createHmac('sha256', salt)
    .update(value.toLowerCase().trim())
    .digest('hex');
}
