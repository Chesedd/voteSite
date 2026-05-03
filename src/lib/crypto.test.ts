import { describe, it, expect } from 'vitest'
import { generateAccessKey, hashKey, hashPassword, verifyPassword } from './crypto'

const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

describe('hashPassword / verifyPassword', () => {
  it('hashPassword returns a bcrypt-formatted string starting with $2', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash.startsWith('$2')).toBe(true)
  })

  it('hashPassword produces different hashes for the same input (salt)', async () => {
    const a = await hashPassword('same-input')
    const b = await hashPassword('same-input')
    expect(a).not.toBe(b)
  })

  it('verifyPassword returns true for the matching plaintext', async () => {
    const plain = 'correct horse battery staple'
    const hash = await hashPassword(plain)
    expect(await verifyPassword(plain, hash)).toBe(true)
  })

  it('verifyPassword returns false for a non-matching plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('verifyPassword returns false for empty plaintext against a real hash', async () => {
    const hash = await hashPassword('not empty')
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('verifyPassword returns false (does not throw) for a malformed hash', async () => {
    await expect(verifyPassword('anything', 'not-a-real-hash')).resolves.toBe(false)
  })
})

describe('hashKey', () => {
  it('returns a known SHA-256 digest for "TESTKEY1"', () => {
    expect(hashKey('TESTKEY1')).toBe(
      '5cf5678cda7235c5333de2a4e00ba3417d8e0673d37a0fef55dab57bc7afd741',
    )
  })

  it('is deterministic (same input → same hash)', () => {
    expect(hashKey('hello')).toBe(hashKey('hello'))
  })

  it('returns a 64-char lowercase hex string', () => {
    const out = hashKey('whatever')
    expect(out).toHaveLength(64)
    expect(out).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles empty string, unicode, and very long strings without throwing', () => {
    expect(() => hashKey('')).not.toThrow()
    expect(hashKey('')).toMatch(/^[0-9a-f]{64}$/)

    expect(() => hashKey('пароль 🔑 ключ')).not.toThrow()
    expect(hashKey('пароль 🔑 ключ')).toMatch(/^[0-9a-f]{64}$/)

    const long = 'x'.repeat(1_000_000)
    expect(() => hashKey(long)).not.toThrow()
    expect(hashKey(long)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('generateAccessKey', () => {
  it('returns a string of exactly 8 characters', () => {
    expect(generateAccessKey()).toHaveLength(8)
  })

  it('every character is in the allowed alphabet', () => {
    const allowed = new Set(ACCESS_KEY_ALPHABET)
    for (let i = 0; i < 200; i++) {
      const key = generateAccessKey()
      for (const ch of key) {
        expect(allowed.has(ch)).toBe(true)
      }
    }
  })

  it('1000 generated keys have no duplicates (statistical sanity)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      seen.add(generateAccessKey())
    }
    expect(seen.size).toBe(1000)
  })

  it('across 10000 keys, every alphabet character appears at least once', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 10000; i++) {
      for (const ch of generateAccessKey()) {
        seen.add(ch)
      }
    }
    for (const ch of ACCESS_KEY_ALPHABET) {
      expect(seen.has(ch)).toBe(true)
    }
  })
})
