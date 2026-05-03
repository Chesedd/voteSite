/**
 * Detect the music streaming service behind a track URL and, where supported,
 * derive the embed URL + service-specific track id.
 *
 * Supported URL patterns
 * ----------------------
 * Yandex Music (embedSupported: true)
 *   - https://music.yandex.{ru,com,by,kz,…}/album/{albumId}/track/{trackId}
 *   - https://music.yandex.{ru,com,…}/track/{trackId}              (no album)
 *   embed: https://music.yandex.ru/iframe/#track/{trackId}/{albumId}
 *          https://music.yandex.ru/iframe/#track/{trackId}        (no album)
 *
 * Spotify (embedSupported: true)
 *   - https://open.spotify.com/track/{id}                          (any query)
 *   - https://open.spotify.com/intl-{xx}/track/{id}                (locale prefix)
 *   embed: https://open.spotify.com/embed/track/{id}
 *
 * YouTube / YouTube Music (embedSupported: true)
 *   - https://www.youtube.com/watch?v={videoId}
 *   - https://youtube.com/watch?v={videoId}
 *   - https://music.youtube.com/watch?v={videoId}
 *   - https://youtu.be/{videoId}
 *   embed: https://www.youtube.com/embed/{videoId}
 *
 * Recognised but not embeddable: VK Music, Apple Music, SoundCloud.
 * Anything else parseable as a URL falls through to service: 'other'.
 *
 * Returns null only when `input` cannot be parsed as a URL with `new URL()`.
 *
 * Pure function, no I/O — safe to call from Edge runtime, server components,
 * client code.
 */

export type EmbedableService = 'yandex' | 'spotify' | 'youtube'
export type NonEmbedableService = 'vk' | 'apple' | 'soundcloud' | 'other'

export type ServiceMatch =
  | {
      service: EmbedableService
      serviceTrackId: string
      embedUrl: string
      embedSupported: true
    }
  | {
      service: NonEmbedableService
      serviceTrackId: null
      embedUrl: null
      embedSupported: false
    }

const NON_EMBED_FALLBACK = (service: NonEmbedableService): ServiceMatch => ({
  service,
  serviceTrackId: null,
  embedUrl: null,
  embedSupported: false,
})

export function detectService(input: string): ServiceMatch | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed.length === 0) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  // Reject non-http(s) schemes — `ftp://example.com` is technically a valid
  // URL but not something we want to classify as a music link.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }

  const host = url.hostname.toLowerCase()

  // Yandex Music: music.yandex.{tld}, any TLD.
  if (host === 'music.yandex.ru' || host === 'music.yandex.com' || /^music\.yandex\./.test(host)) {
    return matchYandex(url)
  }

  if (host === 'open.spotify.com') {
    return matchSpotify(url)
  }

  if (host === 'youtu.be') {
    return matchYoutubeShort(url)
  }
  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'music.youtube.com') {
    return matchYoutubeWatch(url)
  }

  if (host === 'vk.com' || host === 'm.vk.com' || host === 'www.vk.com') {
    return matchVk(url)
  }

  if (host === 'music.apple.com') {
    return NON_EMBED_FALLBACK('apple')
  }

  if (host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'www.soundcloud.com') {
    return matchSoundcloud(url)
  }

  return NON_EMBED_FALLBACK('other')
}

function matchYandex(url: URL): ServiceMatch {
  const segments = url.pathname.split('/').filter(Boolean)
  // /album/{albumId}/track/{trackId}
  if (segments[0] === 'album' && segments[2] === 'track' && segments[1] && segments[3]) {
    const albumId = segments[1]
    const trackId = segments[3]
    return {
      service: 'yandex',
      serviceTrackId: trackId,
      embedUrl: `https://music.yandex.ru/iframe/#track/${trackId}/${albumId}`,
      embedSupported: true,
    }
  }
  // /track/{trackId}
  if (segments[0] === 'track' && segments[1]) {
    const trackId = segments[1]
    return {
      service: 'yandex',
      serviceTrackId: trackId,
      embedUrl: `https://music.yandex.ru/iframe/#track/${trackId}`,
      embedSupported: true,
    }
  }
  // Any other yandex.music URL (artist, album-only, playlist, etc.) — recognised
  // but not embeddable as a track.
  return NON_EMBED_FALLBACK('other')
}

function matchSpotify(url: URL): ServiceMatch {
  // Strip optional /intl-xx prefix: /intl-de/track/{id} → /track/{id}.
  const path = url.pathname.replace(/^\/intl-[a-z]{2}(?=\/)/i, '')
  const segments = path.split('/').filter(Boolean)
  if (segments[0] === 'track' && segments[1]) {
    const id = segments[1]
    return {
      service: 'spotify',
      serviceTrackId: id,
      embedUrl: `https://open.spotify.com/embed/track/${id}`,
      embedSupported: true,
    }
  }
  // open.spotify.com/album/..., /playlist/... etc. — Spotify but not a track.
  return NON_EMBED_FALLBACK('other')
}

function matchYoutubeWatch(url: URL): ServiceMatch {
  const videoId = url.searchParams.get('v')
  if (videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return {
      service: 'youtube',
      serviceTrackId: videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      embedSupported: true,
    }
  }
  return NON_EMBED_FALLBACK('other')
}

function matchYoutubeShort(url: URL): ServiceMatch {
  const segments = url.pathname.split('/').filter(Boolean)
  const videoId = segments[0]
  if (videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return {
      service: 'youtube',
      serviceTrackId: videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      embedSupported: true,
    }
  }
  return NON_EMBED_FALLBACK('other')
}

function matchVk(url: URL): ServiceMatch {
  // vk.com/audio*, /audios{ownerId}, /audio_playlist… — all classified as VK.
  // Other vk.com paths (profiles, posts) fall through to 'other'.
  if (url.pathname.startsWith('/audio')) {
    return NON_EMBED_FALLBACK('vk')
  }
  return NON_EMBED_FALLBACK('other')
}

function matchSoundcloud(url: URL): ServiceMatch {
  // soundcloud.com/{user}/{track} — minimum two non-empty path segments.
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length >= 2) {
    return NON_EMBED_FALLBACK('soundcloud')
  }
  return NON_EMBED_FALLBACK('other')
}
