import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
import { JwtConfigError, signToken, verifyToken } from './jwt'

const TEST_SECRET = 'a'.repeat(48)

describe('signToken / verifyToken', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('roundtrip preserves admin payload', async () => {
    const token = await signToken({ kind: 'admin', sessionId: 'sess_1' })
    const decoded = await verifyToken(token)
    expect(decoded).toEqual({ kind: 'admin', sessionId: 'sess_1' })
  })

  it('roundtrip preserves participant payload', async () => {
    const token = await signToken({
      kind: 'participant',
      sessionId: 'sess_1',
      participantId: 'p_42',
    })
    const decoded = await verifyToken(token)
    expect(decoded).toEqual({
      kind: 'participant',
      sessionId: 'sess_1',
      participantId: 'p_42',
    })
  })

  it('returns null on tampered signature', async () => {
    const token = await signToken({ kind: 'admin', sessionId: 'sess_1' })
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    const sig = parts[2]
    const flipChar = sig[10] === 'A' ? 'B' : 'A'
    const tampered = `${parts[0]}.${parts[1]}.${sig.slice(0, 10)}${flipChar}${sig.slice(11)}`
    expect(await verifyToken(tampered)).toBeNull()
  })

  it.each(['', 'not.a.jwt', 'a.b.c', 'totally-not-a-token', 'a.b'])(
    'returns null on malformed token: %s',
    async (bad) => {
      expect(await verifyToken(bad)).toBeNull()
    },
  )

  it('returns null on expired token', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = await signToken({ kind: 'admin', sessionId: 'sess_1' })

    vi.setSystemTime(new Date('2026-01-02T00:00:01Z'))
    expect(await verifyToken(token)).toBeNull()
  })

  it('returns null when token uses HS512 (alg pinning)', async () => {
    const secretKey = new TextEncoder().encode(TEST_SECRET)
    const wrongAlgToken = await new SignJWT({ kind: 'admin', sessionId: 'sess_1' })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secretKey)
    expect(await verifyToken(wrongAlgToken)).toBeNull()
  })

  it('returns null when payload is missing required fields', async () => {
    const secretKey = new TextEncoder().encode(TEST_SECRET)
    const token = await new SignJWT({ kind: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secretKey)
    expect(await verifyToken(token)).toBeNull()
  })

  it('signToken throws JwtConfigError when JWT_SECRET is missing', async () => {
    vi.stubEnv('JWT_SECRET', '')
    await expect(signToken({ kind: 'admin', sessionId: 'sess_1' })).rejects.toBeInstanceOf(
      JwtConfigError,
    )
  })

  it('signToken throws JwtConfigError when JWT_SECRET is shorter than 32 chars', async () => {
    vi.stubEnv('JWT_SECRET', 'short-secret')
    await expect(signToken({ kind: 'admin', sessionId: 'sess_1' })).rejects.toBeInstanceOf(
      JwtConfigError,
    )
  })
})
