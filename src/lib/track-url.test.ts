import { describe, expect, it } from 'vitest'

import { detectService } from './track-url'

describe('detectService — Yandex Music', () => {
  it('parses /album/{albumId}/track/{trackId}', () => {
    const result = detectService('https://music.yandex.ru/album/123/track/456')
    expect(result).toEqual({
      service: 'yandex',
      serviceTrackId: '456',
      serviceAlbumId: '123',
      embedUrl: 'https://music.yandex.ru/iframe/#track/456/123',
      embedSupported: true,
    })
  })

  it('parses /track/{trackId} without album', () => {
    const result = detectService('https://music.yandex.ru/track/789')
    expect(result).toEqual({
      service: 'yandex',
      serviceTrackId: '789',
      serviceAlbumId: null,
      embedUrl: 'https://music.yandex.ru/iframe/#track/789',
      embedSupported: true,
    })
  })

  it('returns both ids and composite embed url for /album/X/track/Y', () => {
    // Yandex's iframe widget renders "track not found" when only the track
    // id is supplied — both ids must round-trip from URL → detection →
    // storage → embed. Guard explicitly so a future refactor that drops
    // the album id from the iframe URL gets caught.
    const result = detectService('https://music.yandex.ru/album/9876/track/5432')
    expect(result?.service).toBe('yandex')
    expect(result?.serviceTrackId).toBe('5432')
    if (result?.service === 'yandex') {
      expect(result.serviceAlbumId).toBe('9876')
    }
    expect(result?.embedUrl).toBe('https://music.yandex.ru/iframe/#track/5432/9876')
  })

  it('parses .com TLD the same way as .ru', () => {
    const result = detectService('https://music.yandex.com/album/1/track/2')
    expect(result?.service).toBe('yandex')
    expect(result?.embedSupported).toBe(true)
    expect(result?.serviceTrackId).toBe('2')
  })

  it('handles trailing slash, query, and fragment', () => {
    const result = detectService('https://music.yandex.ru/album/10/track/20/?from=share#anchor')
    expect(result?.service).toBe('yandex')
    expect(result?.serviceTrackId).toBe('20')
  })

  it('falls back to other for non-track yandex paths', () => {
    const result = detectService('https://music.yandex.ru/artist/4711')
    expect(result).toEqual({
      service: 'other',
      serviceTrackId: null,
      serviceAlbumId: null,
      embedUrl: null,
      embedSupported: false,
    })
  })
})

describe('detectService — Spotify', () => {
  it('parses /track/{id}', () => {
    const result = detectService('https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp')
    expect(result).toEqual({
      service: 'spotify',
      serviceTrackId: '3n3Ppam7vgaVa1iaRUc9Lp',
      serviceAlbumId: null,
      embedUrl: 'https://open.spotify.com/embed/track/3n3Ppam7vgaVa1iaRUc9Lp',
      embedSupported: true,
    })
  })

  it('parses /track/{id} with ?si= query', () => {
    const result = detectService(
      'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp?si=abc123def456',
    )
    expect(result?.service).toBe('spotify')
    expect(result?.serviceTrackId).toBe('3n3Ppam7vgaVa1iaRUc9Lp')
  })

  it('parses /intl-{lang}/track/{id}', () => {
    const result = detectService('https://open.spotify.com/intl-de/track/abcdef1234567890ABCDEF')
    expect(result).toEqual({
      service: 'spotify',
      serviceTrackId: 'abcdef1234567890ABCDEF',
      serviceAlbumId: null,
      embedUrl: 'https://open.spotify.com/embed/track/abcdef1234567890ABCDEF',
      embedSupported: true,
    })
  })

  it('falls back to other for /album/{id}', () => {
    const result = detectService('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')
    expect(result?.service).toBe('other')
    expect(result?.embedSupported).toBe(false)
  })
})

describe('detectService — YouTube', () => {
  it('parses youtube.com/watch?v=', () => {
    const result = detectService('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result).toEqual({
      service: 'youtube',
      serviceTrackId: 'dQw4w9WgXcQ',
      serviceAlbumId: null,
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      embedSupported: true,
    })
  })

  it('parses youtube.com without www', () => {
    const result = detectService('https://youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result?.service).toBe('youtube')
    expect(result?.serviceTrackId).toBe('dQw4w9WgXcQ')
  })

  it('parses youtu.be short URL', () => {
    const result = detectService('https://youtu.be/dQw4w9WgXcQ')
    expect(result).toEqual({
      service: 'youtube',
      serviceTrackId: 'dQw4w9WgXcQ',
      serviceAlbumId: null,
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      embedSupported: true,
    })
  })

  it('parses music.youtube.com/watch?v=', () => {
    const result = detectService('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=ABC')
    expect(result?.service).toBe('youtube')
    expect(result?.serviceTrackId).toBe('dQw4w9WgXcQ')
  })

  it('preserves video id even with extra params', () => {
    const result = detectService('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=share')
    expect(result?.serviceTrackId).toBe('dQw4w9WgXcQ')
  })

  it('falls back to other when youtube.com has no v= parameter', () => {
    const result = detectService('https://www.youtube.com/feed/trending')
    expect(result?.service).toBe('other')
  })
})

describe('detectService — non-embeddable services', () => {
  it('detects vk.com/audio*', () => {
    const result = detectService('https://vk.com/audio12345_67890')
    expect(result).toEqual({
      service: 'vk',
      serviceTrackId: null,
      serviceAlbumId: null,
      embedUrl: null,
      embedSupported: false,
    })
  })

  it('detects vk.com/audios{ownerId}', () => {
    const result = detectService('https://vk.com/audios123456')
    expect(result?.service).toBe('vk')
  })

  it('detects music.apple.com', () => {
    const result = detectService(
      'https://music.apple.com/us/album/never-gonna-give-you-up/1559523359?i=1559523724',
    )
    expect(result).toEqual({
      service: 'apple',
      serviceTrackId: null,
      serviceAlbumId: null,
      embedUrl: null,
      embedSupported: false,
    })
  })

  it('detects soundcloud.com/{user}/{track}', () => {
    const result = detectService(
      'https://soundcloud.com/rickastleyofficial/never-gonna-give-you-up',
    )
    expect(result).toEqual({
      service: 'soundcloud',
      serviceTrackId: null,
      serviceAlbumId: null,
      embedUrl: null,
      embedSupported: false,
    })
  })

  it('falls back to other for soundcloud root', () => {
    const result = detectService('https://soundcloud.com/')
    expect(result?.service).toBe('other')
  })
})

describe('detectService — other / fallback', () => {
  it('returns other for unknown music URL', () => {
    const result = detectService('https://bandcamp.com/track/something')
    expect(result).toEqual({
      service: 'other',
      serviceTrackId: null,
      serviceAlbumId: null,
      embedUrl: null,
      embedSupported: false,
    })
  })

  it('returns other for non-music URL', () => {
    const result = detectService('https://wikipedia.org/wiki/Music')
    expect(result?.service).toBe('other')
  })
})

describe('detectService — null / unparseable', () => {
  it('returns null for plain string', () => {
    expect(detectService('hello')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(detectService('')).toBeNull()
  })

  it('returns null for whitespace only', () => {
    expect(detectService('   ')).toBeNull()
  })

  it('returns null for ftp scheme', () => {
    expect(detectService('ftp://example.com/file.mp3')).toBeNull()
  })

  it('returns null for malformed URL', () => {
    expect(detectService('http://')).toBeNull()
    expect(detectService('://nope')).toBeNull()
    expect(detectService('https:// space.com')).toBeNull()
  })
})

describe('detectService — return shape', () => {
  it('embed-supported services return string embedUrl + true flag', () => {
    const yandex = detectService('https://music.yandex.ru/album/1/track/2')
    expect(typeof yandex?.embedUrl).toBe('string')
    expect(yandex?.embedSupported).toBe(true)

    const spotify = detectService('https://open.spotify.com/track/abc123')
    expect(typeof spotify?.embedUrl).toBe('string')

    const youtube = detectService('https://youtu.be/dQw4w9WgXcQ')
    expect(typeof youtube?.embedUrl).toBe('string')
  })

  it('non-embed-supported services return null embedUrl + false flag', () => {
    const vk = detectService('https://vk.com/audio12345_67890')
    expect(vk?.embedUrl).toBeNull()
    expect(vk?.serviceTrackId).toBeNull()
    expect(vk?.embedSupported).toBe(false)

    const other = detectService('https://wikipedia.org')
    expect(other?.embedUrl).toBeNull()
    expect(other?.serviceTrackId).toBeNull()
  })
})
