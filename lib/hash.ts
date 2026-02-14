import crypto from 'crypto';

// Use a fixed salt for deterministic hashing (lookup)
// In production, this should be in process.env
const SALT = "VAULT_MILITARY_GRADE_SALT_V1";

export function hashPhrase(phrase: string): string {
  return crypto.createHmac('sha256', SALT).update(phrase).digest('hex');
}
