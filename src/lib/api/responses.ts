/**
 * Standard API response helpers.
 *
 * Every route handler MUST shape its responses through `ok` or `err` so that
 * the wire format stays consistent: `{ ok: true, data }` or
 * `{ ok: false, error: { code, message } }`. See CLAUDE.md "Conventions" and
 * docs/ARCHITECTURE.md "Error Codes".
 */

import { NextResponse } from 'next/server'

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiError = {
  ok: false
  error: { code: string; message: string }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError

export function ok<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json({ ok: true, data } satisfies ApiSuccess<T>, init)
}

export function err(code: string, message: string, status: number): Response {
  return NextResponse.json({ ok: false, error: { code, message } } satisfies ApiError, { status })
}
