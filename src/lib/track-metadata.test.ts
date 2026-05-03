import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchOgMetadata } from './track-metadata'

const originalFetch = globalThis.fetch

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  })
}

function withFetch(mock: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('fetch', mock)
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.fetch = originalFetch
})

describe('fetchOgMetadata', () => {
  it('parses all four OG fields when present', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="My Track Title">
          <meta property="og:description" content="A great song">
          <meta property="og:image" content="https://example.com/cover.jpg">
          <meta property="og:site_name" content="Example Music">
        </head>
        <body></body>
      </html>
    `
    withFetch(vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchOgMetadata('https://example.com/track/1')
    expect(result).toEqual({
      title: 'My Track Title',
      description: 'A great song',
      image: 'https://example.com/cover.jpg',
      siteName: 'Example Music',
    })
  })

  it('returns nulls for missing OG tags but extracts og:title only', async () => {
    const html = `
      <html><head><meta property="og:title" content="Solo title"></head><body></body></html>
    `
    withFetch(vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchOgMetadata('https://example.com/x')
    expect(result).toEqual({
      title: 'Solo title',
      description: null,
      image: null,
      siteName: null,
    })
  })

  it('falls back to <title> tag when og:title is missing', async () => {
    const html = `
      <html><head><title>Plain HTML Title</title></head><body></body></html>
    `
    withFetch(vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchOgMetadata('https://example.com/y')
    expect(result.title).toBe('Plain HTML Title')
    expect(result.description).toBeNull()
    expect(result.image).toBeNull()
    expect(result.siteName).toBeNull()
  })

  it('returns empty object on non-HTML content-type', async () => {
    withFetch(
      vi.fn().mockResolvedValue(
        new Response('{"foo":"bar"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    const result = await fetchOgMetadata('https://example.com/api')
    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      siteName: null,
    })
  })

  it('returns empty object on 404 response', async () => {
    withFetch(
      vi.fn().mockResolvedValue(
        new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )

    const result = await fetchOgMetadata('https://example.com/missing')
    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      siteName: null,
    })
  })

  it('returns empty object on 500 response', async () => {
    withFetch(
      vi.fn().mockResolvedValue(
        new Response('boom', {
          status: 500,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )

    const result = await fetchOgMetadata('https://example.com/oops')
    expect(result.title).toBeNull()
  })

  it('returns empty object when fetch throws (network error)', async () => {
    withFetch(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchOgMetadata('https://example.com/down')
    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      siteName: null,
    })
  })

  it('returns empty object on AbortError (timeout)', async () => {
    withFetch(
      vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      }),
    )

    const result = await fetchOgMetadata('https://example.com/slow')
    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      siteName: null,
    })
  })

  it('passes the User-Agent and Accept headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse('<html></html>'))
    withFetch(fetchMock)

    await fetchOgMetadata('https://example.com/x')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.['User-Agent']).toBe('voteSite/1.0 (+metadata-fetch)')
    expect(headers?.['Accept']).toBe('text/html')
  })

  it('also reads name="og:*" attribute (some sites emit that)', async () => {
    const html = `<html><head><meta name="og:title" content="Via name attr"></head></html>`
    withFetch(vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchOgMetadata('https://example.com/z')
    expect(result.title).toBe('Via name attr')
  })

  it('treats whitespace-only content as null', async () => {
    const html = `<html><head><meta property="og:title" content="   "><title>   </title></head></html>`
    withFetch(vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchOgMetadata('https://example.com/blank')
    expect(result.title).toBeNull()
  })
})
