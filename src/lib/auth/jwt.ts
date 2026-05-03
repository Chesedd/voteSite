/**
 * JWT signing and verification.
 *
 * Edge-compatible: uses `jose` (Web Crypto under the hood), no Node-only APIs.
 * This module is safe to import from middleware.
 *
 * The signing algorithm is pinned to HS256 in both sign and verify. Tokens with
 * any other `alg` header (including `none`, `RS*`, `HS512`) are rejected.
 */

import { SignJWT, jwtVerify } from 'jose'

const JWT_ALGORITHM = 'HS256'
const TOKEN_EXPIRATION = '24h'
const MIN_SECRET_LENGTH = 32

export class JwtConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JwtConfigError'
  }
}

export type SessionTokenPayload =
  | { kind: 'admin'; sessionId: string }
  | { kind: 'participant'; sessionId: string; participantId: string }

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new JwtConfigError('JWT_SECRET is not set')
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new JwtConfigError(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters (got ${secret.length})`,
    )
  }
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: SessionTokenPayload): Promise<string> {
  const secretKey = getSecretKey()
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRATION)
    .sign(secretKey)
}

function isValidPayload(value: unknown): value is SessionTokenPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.kind === 'admin') {
    return typeof v.sessionId === 'string' && v.sessionId.length > 0
  }
  if (v.kind === 'participant') {
    return (
      typeof v.sessionId === 'string' &&
      v.sessionId.length > 0 &&
      typeof v.participantId === 'string' &&
      v.participantId.length > 0
    )
  }
  return false
}

export async function verifyToken(token: string): Promise<SessionTokenPayload | null> {
  let secretKey: Uint8Array
  try {
    secretKey = getSecretKey()
  } catch (err) {
    if (err instanceof JwtConfigError) throw err
    return null
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: [JWT_ALGORITHM],
    })
    if (!isValidPayload(payload)) return null
    if (payload.kind === 'admin') {
      return { kind: 'admin', sessionId: payload.sessionId }
    }
    return {
      kind: 'participant',
      sessionId: payload.sessionId,
      participantId: payload.participantId,
    }
  } catch {
    return null
  }
}
