/**
 * Crypto utilities — password hashing and access-key handling.
 *
 * Server-only: this module imports Node's built-in `crypto` module and the native
 * `bcrypt` package. It MUST NOT be imported from Edge runtime code or client
 * components — both will fail at build/runtime.
 *
 * - Admin passwords use bcrypt (slow, brute-force resistant).
 * - Participant access keys use SHA-256 (fast lookup; keys are random 8-char,
 *   ~40 bits of entropy, used as one-time login credentials, not as long-term
 *   secrets, so the speed of SHA-256 is acceptable).
 */

import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = 10

/**
 * Alphabet for participant access keys: 32 symbols, no I / O / 0 / 1 (visually
 * confusable). 256 / 32 = 8, so mapping a random byte via modulo produces an
 * exactly uniform distribution — no rejection sampling needed.
 */
const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ACCESS_KEY_LENGTH = 8

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash)
  } catch {
    return false
  }
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function generateAccessKey(): string {
  const bytes = randomBytes(ACCESS_KEY_LENGTH)
  let key = ''
  for (let i = 0; i < ACCESS_KEY_LENGTH; i++) {
    key += ACCESS_KEY_ALPHABET[bytes[i] % ACCESS_KEY_ALPHABET.length]
  }
  return key
}

/**
 * URL-safe random token used for join links.
 * 16 chars from base64url alphabet, ~96 bits entropy.
 */
export function generateJoinToken(): string {
  return randomBytes(12).toString('base64url')
}
