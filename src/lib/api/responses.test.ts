import { describe, expect, it } from 'vitest'
import { err, ok, type ApiError, type ApiSuccess } from './responses'

describe('ok', () => {
  it('returns 200 with the success envelope by default', async () => {
    const res = ok({ foo: 1 })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = (await res.json()) as ApiSuccess<{ foo: number }>
    expect(body).toEqual({ ok: true, data: { foo: 1 } })
  })

  it('respects an explicit init.status (e.g. 201)', async () => {
    const res = ok({ created: true }, { status: 201 })
    expect(res.status).toBe(201)
    const body = (await res.json()) as ApiSuccess<{ created: boolean }>
    expect(body).toEqual({ ok: true, data: { created: true } })
  })

  it('serializes null as data', async () => {
    const res = ok(null)
    const body = (await res.json()) as ApiSuccess<null>
    expect(body).toEqual({ ok: true, data: null })
  })
})

describe('err', () => {
  it('returns the standard error envelope with the given status', async () => {
    const res = err('NOT_FOUND', 'gone', 404)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = (await res.json()) as ApiError
    expect(body).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'gone' } })
  })

  it('supports any HTTP status', async () => {
    const res = err('UNAUTHORIZED', 'no token', 401)
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})
