# Architecture

Reference document. The plan with tickets and statuses is in `ROADMAP.md`. Project orientation and conventions for agents are in `/CLAUDE.md`.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15.5.x (App Router) | NOT 16. Pin via `pnpm create next-app@15`. |
| Language | TypeScript strict | No `any`. |
| Package manager | pnpm v9+ | postinstall scripts are opt-in (see CLAUDE.md). |
| Styling | Tailwind CSS v4 | CSS-based config, no `tailwind.config.js`. |
| UI primitives | shadcn/ui (new-york, neutral) | Components in `src/components/ui/`. |
| Theming | next-themes | `attribute="class"`, system default. |
| Toasts | Sonner | Mounted in root layout. |
| Database | PostgreSQL via Neon (free tier) | Pooled + direct connection URLs. |
| ORM | Prisma 6.x | NOT 7 (schema-level url/directUrl removed in 7). |
| Auth | JWT in httpOnly cookie | `jose` library, Edge-compatible. |
| Hashing | bcrypt + SHA-256 | bcrypt for admin password, SHA-256 for participant keys. |
| Validation | Zod | All API inputs. |
| Testing | Vitest | Pure-function modules only. |
| Hosting | Vercel | Free hobby tier. |

## Data Model

Final shape lives in `prisma/schema.prisma`. This document specifies intent; if it drifts from `schema.prisma`, schema is canonical.

### Entities

```
SessionStage = SETUP | STAGE1 | STAGE2 | FINISHED

Session
  id              String   @id @default(cuid())
  title           String
  stage           SessionStage @default(SETUP)
  adminPasswordHash String
  settings        Json     @default("{}")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

Participant
  id              String   @id @default(cuid())
  sessionId       String
  accessKeyHash   String   // SHA-256 of plaintext key
  displayName     String?
  hasJoined       Boolean  @default(false)
  lastSeenAt      DateTime?
  createdAt       DateTime @default(now())
  @@unique([sessionId, accessKeyHash])

Track
  id              String   @id @default(cuid())
  sessionId       String
  submittedById   String   // → Participant
  title           String
  artist          String?
  url             String?
  description     String?
  service         String?  // 'yandex' | 'spotify' | 'youtube' | 'vk' | 'apple' | 'soundcloud' | 'other'
  serviceTrackId  String?  // For embed URL construction (yandex/spotify/youtube only)
  coverUrl        String?
  embedSupported  Boolean  @default(false)
  createdAt       DateTime @default(now())

Vote
  id              String   @id @default(cuid())
  sessionId       String
  participantId   String
  trackId         String
  rank            Int      // 1 | 2 | 3
  updatedAt       DateTime @updatedAt
  @@unique([participantId, rank])    // one vote per rank per participant
  @@unique([participantId, trackId]) // one rank per track per participant
```

> Note: service/serviceTrackId/coverUrl/embedSupported are added by a later migration in Phase 4 (see ROADMAP P4-01b). Phase 1 schema does not include them.

### Settings (JSONB on Session)

```ts
type SessionSettings = {
  maxTracksPerParticipant: number  // default 3
  revealResults: boolean           // default false (only relevant in FINISHED)
  // future: anonymize, votingMethod, etc.
}
```

Stored as JSON to avoid migrations when adding new toggles. Always read with a Zod schema providing defaults.

### Cascades

When a `Session` is deleted, all participants/tracks/votes cascade. When a `Participant` is deleted, their tracks and votes cascade. When a `Track` is deleted, votes referencing it cascade.

## Stage Machine

```
(no session) ──[POST /api/setup]──▶ STAGE1
                                       │
                                       [admin advances]
                                       ▼
                                     STAGE2
                                       │
                                       [admin advances]
                                       ▼
                                    FINISHED
```

The `SETUP` enum value still exists in `SessionStage` (Prisma schema default),
but in practice no Session row ever lives in it: `POST /api/setup` creates the
Session and its Participant rows in a single transaction, so the row is born
in `STAGE1`. `SETUP` therefore represents "no Session row exists yet" rather
than a stored state. We don't drop the enum value to avoid a non-trivial
migration; treat it as a leftover, not a transition target.

### Allowed Transitions

| From | To | Conditions | Side effects |
|---|---|---|---|
| (no session) | STAGE1 | `POST /api/setup` with valid input and ≥2 participants requested | Creates Session + N Participants atomically. |
| STAGE1 | STAGE2 | ≥3 tracks from ≥2 distinct authors | None |
| STAGE2 | FINISHED | none | None |
| STAGE2 | STAGE1 (rollback) | none | Votes preserved (frozen). UI shows warning. |
| FINISHED | STAGE2 (rollback) | none | Votes preserved. UI shows warning. |

All other transitions: forbidden, return 400 with code `INVALID_STAGE_TRANSITION`.

Implementation lives in `src/lib/stage.ts` as a pure `canTransition(from, to)` function plus `getTransitionRequirements(session, to)`. Both are unit-tested.

### Visibility Matrix

(`SETUP` column kept for completeness even though no Session row should ever
be in this state — see "Stage Machine" above.)

| | SETUP | STAGE1 | STAGE2 | FINISHED (hidden) | FINISHED (revealed) |
|---|---|---|---|---|---|
| Participants see other tracks | — | ✅ | ✅ | ✅ | ✅ |
| Participants see track authors | — | ✅ | ✅ | ✅ | ✅ |
| Participants see vote counts | — | — | ❌ | ❌ | ✅ |
| Admin sees everything | ✅ | ✅ | ✅ | ✅ | ✅ |

`revealResults` is a `Session.settings` flag, toggled by the admin only when stage = FINISHED.

## Track URL Handling

Tracks are submitted with a URL. The server parses the URL, classifies the service, fetches metadata, and decides whether an inline player can be rendered.

### Supported services

| Service | Detection | Embed player | Embed URL pattern |
|---|---|---|---|
| Yandex Music | hostname `music.yandex.*`, path `/album/X/track/Y` or `/track/Y` | ✅ | `https://music.yandex.ru/iframe/#track/{trackId}/{albumId}` |
| Spotify | hostname `open.spotify.com`, path `/track/{id}` | ✅ | `https://open.spotify.com/embed/track/{id}` |
| YouTube | hostnames `youtube.com`, `youtu.be`, `music.youtube.com` | ✅ | `https://www.youtube.com/embed/{videoId}` |
| VK Music | hostname `vk.com`, path `/audio*` | ❌ (VK closed audio API in 2016, no public embed) | — |
| Apple Music, SoundCloud, Bandcamp, Deezer, etc. | hostname match | ❌ (out of scope) | — |
| Anything else | fallback | ❌ | — |

### Detection function

`src/lib/track-url.ts` exports a pure function:

```ts
type ServiceMatch =
  | { kind: 'yandex' | 'spotify' | 'youtube'; serviceTrackId: string; embedUrl: string }
  | { kind: 'vk' | 'apple' | 'soundcloud' | 'other'; serviceTrackId: null; embedUrl: null }

function detectService(url: string): ServiceMatch | null  // null = unparseable URL
```

Pure function, fully unit-tested with example URLs from each service plus malformed inputs.

### Metadata extraction

For all detected services (including non-embed-able), the server fetches the public share page and parses OpenGraph meta tags to extract:
- `og:title` → fallback for `title` field
- `og:image` → `coverUrl`
- `og:site_name` or `og:description` → fallback for `artist`

User-entered title/artist always override OG-extracted values. Metadata fetch happens once at submission time and is cached in the Track row.

### Implementation notes

- Server-side fetch only (no CORS issues). Use a generic User-Agent string; some services rate-limit or block requests with no UA.
- Timeout: 5 seconds. On timeout/failure, save the Track without metadata — user can still submit.
- Do NOT fetch on every render. coverUrl is stored in DB.
- The fetch happens in the POST /api/tracks/preview endpoint (admin-side preflight) and again in POST /api/tracks (authoritative). Preview endpoint is for UI auto-fill before user clicks Submit.

## Auth Flow

### Admin

1. POST `/api/auth/admin` with `{ password }`.
2. Backend `bcrypt.compare(password, session.adminPasswordHash)`. On fail: 401 + rate-limit increment.
3. On success: sign JWT `{ kind: 'admin', sessionId, exp: now + 24h }`, set as `session_token` httpOnly cookie.
4. Subsequent requests: `middleware.ts` parses cookie via `jose.jwtVerify`, attaches decoded payload to request headers.
5. API handlers call `requireAdmin(req)` which throws 401 if missing or wrong kind.

### Participant

1. POST `/api/auth/participant` with `{ accessKey }` (8-char string from admin).
2. Backend computes SHA-256(plaintext key), looks up Participant by `accessKeyHash`.
3. On miss: 401 + rate-limit increment.
4. On hit: update `lastSeenAt` and set `hasJoined=true`, sign JWT `{ kind: 'participant', sessionId, participantId, exp: now + 24h }`, set cookie.
5. Same middleware/guard pattern.

### Rate limiting

In-memory map keyed by IP (or fallback to `x-forwarded-for`). After 5 failed attempts in 5 minutes: 429 for the next 5 minutes. Sufficient for one-off tool, no Redis.

### Cookie attributes

```
httpOnly: true
sameSite: 'lax'
secure: true (production only)
path: '/'
maxAge: 24 * 60 * 60
```

`logout` endpoint clears the cookie by re-setting it with `maxAge: 0`.

### Single active session

We support exactly one active `Session` row at a time. The setup screen blocks if one exists. `GET /api/session` (no auth) returns `{ exists: boolean, stage: SessionStage }` for the home page router to decide between `/setup`, `/login`, etc.

## API Endpoints

Conventions:
- Path under `/api/`
- All responses: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`
- Auth column: `none` / `admin` / `participant`
- Error codes are stable strings; messages may be updated freely.

### Auth

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/admin` | none | `{ password }` | `{ ok: true }` + cookie |
| POST | `/api/auth/participant` | none | `{ accessKey }` | `{ ok: true, data: { participant: { id, displayName } } }` + cookie |
| POST | `/api/auth/logout` | any | — | `{ ok: true }` (clears cookie) |

### Session lifecycle

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/api/session` | none | — | `{ ok: true, data: { exists, stage } }` |
| POST | `/api/setup` | none (gated by `exists=false`) | `{ password, participantCount }` | `{ ok: true, data: { accessKeys: string[] } }` |
| POST | `/api/admin/stage` | admin | `{ to: SessionStage }` | `{ ok: true, data: { stage } }` |
| POST | `/api/admin/reset` | admin | `{ confirmTitle }` | `{ ok: true }` |
| PATCH | `/api/admin/settings` | admin | partial settings | `{ ok: true, data: { settings } }` |

### Participants (admin)

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/api/admin/participants` | admin | — | `{ ok: true, data: Participant[] }` |
| POST | `/api/admin/participants` | admin | `{ count }` | `{ ok: true, data: { accessKeys: string[] } }` |
| PATCH | `/api/admin/participants/:id` | admin | `{ displayName? }` | `{ ok: true, data: Participant }` |
| POST | `/api/admin/participants/:id/regenerate` | admin | — | `{ ok: true, data: { accessKey: string } }` |
| DELETE | `/api/admin/participants/:id` | admin | — | `{ ok: true }` |

### Current participant

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/api/me` | participant | — | `{ ok: true, data: { participant, stage, settings } }` |

### Tracks

| Method | Path | Auth | Body | Returns | Stage gate |
|---|---|---|---|---|---|
| POST | `/api/tracks/preview` | participant | `{ url }` | `{ ok: true, data: { service, serviceTrackId, embedSupported, suggestedTitle?, suggestedArtist?, coverUrl? } }` | STAGE1 only |
| GET | `/api/tracks` | participant | — | `{ ok: true, data: TrackPublic[] }` | STAGE1, STAGE2, FINISHED |
| POST | `/api/tracks` | participant | `{ title, artist?, url?, description?, service?, serviceTrackId?, coverUrl?, embedSupported? }` | `{ ok: true, data: Track }` | STAGE1 only |
| PATCH | `/api/tracks/:id` | participant (own only) | partial | `{ ok: true, data: Track }` | STAGE1 only |
| DELETE | `/api/tracks/:id` | participant (own) OR admin | — | `{ ok: true }` | STAGE1 (own); admin any time |

`service`/`serviceTrackId`/`coverUrl`/`embedSupported` on POST `/api/tracks` are typically populated by the client from the `/api/tracks/preview` response, but the server re-validates and may overwrite them.

`TrackPublic` shape: `{ id, title, artist, url, description, submittedBy: { id, displayName } }`. No internal fields.

### Votes

| Method | Path | Auth | Body | Returns | Stage gate |
|---|---|---|---|---|---|
| GET | `/api/votes/me` | participant | — | `{ ok: true, data: { rank: trackId \| null }[3] }` | STAGE2 |
| PUT | `/api/votes` | participant | `{ trackId, rank: 1\|2\|3 }` | `{ ok: true, data: VoteState }` | STAGE2 |
| DELETE | `/api/votes/:rank` | participant | — | `{ ok: true }` | STAGE2 |

PUT semantics (transactional): if participant already has a vote at this rank → replace it. If this trackId is already at another rank for this participant → that other rank is cleared (track moves). Never two votes for the same track.

### Results (admin)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/admin/results` | admin | `{ ok: true, data: { results: TrackResult[], matrix: VoterRankMatrix } }` |
| GET | `/api/admin/results/export` | admin | CSV file download |

### Results (participant, stage = FINISHED + revealed)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/results` | participant | `{ ok: true, data: TrackResult[] }` (no matrix) |

`TrackResult` shape:
```ts
{
  trackId: string
  title: string
  artist: string | null
  submittedBy: { id, displayName }
  points: number
  voters: number
  perRank: { 1: number, 2: number, 3: number }
}
```

## Scoring

Pure function in `src/lib/scoring.ts`:

```ts
function computeResults(
  tracks: Track[],
  votes: Vote[]
): TrackResult[]
```

- Points: `rank=1` → 3, `rank=2` → 2, `rank=3` → 1.
- Each track's `points` = sum across all participants' votes for it.
- `voters` = count of distinct participants who ranked the track.
- `perRank` = histogram of ranks for the track.

Sort order:
1. `points` descending
2. `perRank[1]` descending (most first-place votes)
3. `perRank[2]` descending
4. Title alphabetical (case-insensitive)

Tiebreakers are explicit so the function is deterministic. Unit-tested with hand-crafted scenarios.

## Error Codes

Stable across versions, used by frontend for branching UI:

| Code | When |
|---|---|
| `INVALID_PASSWORD` | Admin login failed |
| `INVALID_KEY` | Participant key not found |
| `RATE_LIMITED` | Too many failed login attempts |
| `UNAUTHORIZED` | Missing or expired token |
| `FORBIDDEN` | Wrong actor kind for this endpoint |
| `INVALID_INPUT` | Zod validation failed (always include details in `message` or `error.fields`) |
| `INVALID_STAGE` | Operation not allowed in current stage |
| `INVALID_STAGE_TRANSITION` | Requested stage transition is not allowed |
| `STAGE_PREREQUISITES_NOT_MET` | Transition allowed in principle, but conditions unmet (e.g. <3 tracks) |
| `LIMIT_EXCEEDED` | Tried to add a 4th track |
| `NOT_FOUND` | Resource doesn't exist or doesn't belong to this session |
| `OWNERSHIP_REQUIRED` | Tried to mutate someone else's resource |
| `SESSION_EXISTS` | Tried to run setup when a session already exists |

## Operational Notes

### Pages are force-dynamic

Every page under `src/app/` reads from the database, cookies, or auth state, so
static prerendering would fail at build time (no `DATABASE_URL`) or serve stale
HTML to logged-in users. We treat `export const dynamic = 'force-dynamic'` as
the default for this app — there are no static pages. New pages must add this
line. Convention details in `/CLAUDE.md` "Conventions".

### Sandbox network restrictions for agent sessions

- `ui.shadcn.com` blocked. Use `REGISTRY_URL=https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/public/r` when running `pnpm dlx shadcn@latest add <comp>`.
- Other domains: if a request fails with `host_not_allowed`, surface it in the PR description rather than silently working around.

### Migration workflow

```bash
# After editing prisma/schema.prisma:
pnpm prisma migrate dev --name short_description    # local dev DB
# Commits the migration file to prisma/migrations/

# In production (Vercel build):
pnpm prisma migrate deploy
```

`prisma migrate deploy` runs in build, not at request time. If a migration fails in CI, the deploy fails — never run untested migrations against prod.

### Polling vs realtime

Stage 6 onward uses simple polling (`setInterval` in a hook, paused while tab is hidden). 5-second interval is fine for ≤20 participants. We do NOT add WebSockets / SSE / Supabase Realtime — overengineering for this scale.

### Logging

Server-side: `console.error` for unexpected errors; `console.log` is fine for development tracing but should be cleaned up before merge unless gated by `NODE_ENV !== 'production'`.

Client-side: avoid `console.*` in committed code. Use Sonner toasts for anything the user should see.

## Out-of-Scope (Parking Lot)

Captured here so they're not lost; not in roadmap until promoted.

- Multiple concurrent voting sessions (single-active simplifies a lot of edge cases)
- Email/SMS delivery of access keys (currently copy-paste from admin UI)
- Spotify/YouTube oEmbed previews on tracks
- Anonymous mode (track authors hidden from peers)
- Audit log retention policy / archive
- i18n beyond Russian
