/**
 * Fetch a public web page and extract OpenGraph metadata used to auto-fill
 * the track submission form.
 *
 * Contract:
 *   - Times out after 5000 ms (`AbortSignal.timeout`).
 *   - Sends a `User-Agent: voteSite/1.0 (+metadata-fetch)` header so services
 *     that 4xx requests with no UA still respond.
 *   - Sends `Accept: text/html` to discourage JSON / API responses.
 *   - Never throws. Any failure (timeout, non-200, non-HTML, parse error,
 *     network) is swallowed and an empty-shape OgMetadata is returned.
 *
 * Returns:
 *   { title, description, image, siteName } — every field is `string` or `null`.
 *   `title` falls back to the document `<title>` tag when `og:title` is absent.
 *
 * Server-side only — fetch hits the upstream from our origin; do not import
 * from client components.
 */

import { parse } from 'node-html-parser'

export type OgMetadata = {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

const FETCH_TIMEOUT_MS = 5000
const USER_AGENT = 'voteSite/1.0 (+metadata-fetch)'

const EMPTY: OgMetadata = {
  title: null,
  description: null,
  image: null,
  siteName: null,
}

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })

    if (!response.ok) return EMPTY

    const contentType = response.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      return EMPTY
    }

    const html = await response.text()
    return parseOg(html)
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[track-metadata] fetch failed:', e)
    }
    return EMPTY
  }
}

function parseOg(html: string): OgMetadata {
  try {
    const root = parse(html)

    const ogTitle = readMeta(root, 'og:title')
    const ogDescription = readMeta(root, 'og:description')
    const ogImage = readMeta(root, 'og:image')
    const ogSiteName = readMeta(root, 'og:site_name')

    let title: string | null = ogTitle
    if (!title) {
      const titleEl = root.querySelector('title')
      const titleText = titleEl?.text?.trim()
      title = titleText && titleText.length > 0 ? titleText : null
    }

    return {
      title,
      description: ogDescription,
      image: ogImage,
      siteName: ogSiteName,
    }
  } catch {
    return EMPTY
  }
}

function readMeta(root: ReturnType<typeof parse>, property: string): string | null {
  // OpenGraph spec uses `property=`; some services also expose `name=`.
  const selector = `meta[property="${property}"], meta[name="${property}"]`
  const el = root.querySelector(selector)
  const content = el?.getAttribute('content')
  if (typeof content !== 'string') return null
  const trimmed = content.trim()
  return trimmed.length > 0 ? trimmed : null
}
