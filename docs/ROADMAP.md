# Roadmap: сайт для голосования за песни

> Оркестрационный документ. Один тикет = одна короткая сессия Claude Code (30 мин – 2 часа).
> Сессия должна закрываться отдельным PR. Если тикет разрастается — это сигнал, что его нужно дробить.

---

## Как использовать

### Workflow одного тикета

1. Открыть тикет в этом файле, целиком скопировать его блок.
2. В терминале запустить `claude` в корне репо.
3. Промпт:
   ```
   Прочти CLAUDE.md, docs/ARCHITECTURE.md и docs/ROADMAP.md.
   Реализуй TICKET-XXX (полный текст ниже).

   <вставка тикета>

   После реализации:
   - убедись, что pnpm build, pnpm lint, pnpm typecheck проходят
   - сделай коммит и открой PR с веткой feature/ticket-xxx-short-name
   - в описании PR — чек-лист acceptance criteria
   ```
4. Сессия делает PR. Я (оркестратор) проверяю по acceptance criteria.
5. После мержа — статус тикета меняется на ✅ в этом файле.

### Статусы

| Иконка | Значение |
|---|---|
| ⬜ | TODO — не начат |
| 🟡 | WIP — в работе или PR на ревью |
| ✅ | DONE — смержен в `main` |
| ⏸️ | BLOCKED — ждёт зависимость |
| ❌ | DROPPED — отказались |

### Принципы для агентов

- **Тонкие срезы**. Каждый тикет даёт работающий end-to-end кусок (даже если на заглушках), а не полслоя без связи.
- **Не выходить за скоуп**. Если в процессе нашёлся баг или улучшение вне тикета — оформить как новый тикет в конце roadmap, не делать в текущем PR.
- **Читать существующий код**. Перед написанием новой функции — поискать, не существует ли уже похожей. Соглашения важнее личных предпочтений.
- **Тесты — там, где они дают сигнал**. Юнит-тесты на чистые функции (валидаторы, скоринг). Не покрывать тестами тривиальный CRUD UI на этом этапе.

---

## Архитектурный снимок

Полная архитектура — в `docs/ARCHITECTURE.md` (создаётся в P0-06). Здесь — короткая выжимка для контекста.

### Стек

- Next.js 15 (App Router) + TypeScript
- pnpm как пакетный менеджер
- Tailwind CSS + shadcn/ui для UI
- Prisma ORM + PostgreSQL (Neon serverless free tier)
- jose для JWT в httpOnly cookies
- bcrypt для хешей паролей
- Vercel для хостинга
- Zod для валидации входных данных API

### Сущности (упрощённо, точная схема — в P1-01)

```
Session
  id, title, stage, adminPasswordHash, settings (JSONB), createdAt, updatedAt

Participant
  id, sessionId, accessKeyHash, displayName, hasJoined, lastSeenAt, createdAt

Track
  id, sessionId, submittedById, title, artist?, url?, description?, service?, serviceTrackId?, coverUrl?, embedSupported (default false), createdAt

Vote
  id, sessionId, participantId, trackId, rank (1|2|3), updatedAt
  UNIQUE(participantId, rank)
  UNIQUE(participantId, trackId)
```

### Этапы

```
setup → stage1 → stage2 → finished
                   ↑          ↓
                   └── (с подтверждением) ─┘
```

Откат `stage2 → stage1` сохраняет голоса замороженными. Откат из `finished` — только в `stage2`.

### Голосование

Топ-3 ранжирование. Скоринг: 1-е место = 3 балла, 2-е = 2, 3-е = 1. Можно голосовать неполным топом. Можно голосовать за свой трек. Минимум 3 трека в пуле для запуска stage2.

### Видимость

| | Stage1 | Stage2 | Finished (скрыто) | Finished (раскрыто) |
|---|---|---|---|---|
| Участник видит чужие треки | ✅ | ✅ | ✅ | ✅ |
| Участник видит автора трека | ✅ | ✅ | ✅ | ✅ |
| Участник видит счёт | ❌ | ❌ | ❌ | ✅ |
| Админ видит всё | ✅ | ✅ | ✅ | ✅ |

---

## Конвенции проекта

Полные — в `CLAUDE.md` (создаётся в P0-06). Краткое:

- Файловая структура: `src/app/...` (роуты), `src/lib/...` (бизнес-логика), `src/components/...` (UI), `src/db/...` (Prisma client + хелперы).
- Имена файлов: `kebab-case.ts`, компоненты `PascalCase.tsx`.
- API-роуты возвращают JSON в формате `{ ok: true, data }` или `{ ok: false, error: { code, message } }`.
- Все входные данные API валидируются через Zod-схему до бизнес-логики.
- Аутентификация — через JWT в `httpOnly` cookie. Хелпер `getSessionUser()` из middleware.
- Серверные действия (Server Actions) использовать только там, где нет смысла в API endpoint (формы без real-time).
- Сообщения пользователю — на русском. Логи и комментарии в коде — на английском.

---

## Phases & tickets

### Phase 0 — Foundation

Цель: рабочий скелет, в который можно начать класть фичи. На выходе — `pnpm dev` поднимает пустую страницу с подключенной БД.

#### TICKET-P0-01 ✅ — Init Next.js project (PR #1)

**Scope**: корень репо
**Deliverable**: инициализированный Next.js 15 проект с TypeScript, Tailwind, App Router, pnpm
**Acceptance**:
- `pnpm install && pnpm dev` поднимает страницу на `localhost:3000`
- TypeScript строгий режим включён (`strict: true`)
- Tailwind работает (проверить классом на главной)
- Структура `src/app`, `src/components`, `src/lib`
- `.gitignore` включает `.env*.local`, `.next`, `node_modules`
- README с командами: `dev`, `build`, `lint`, `typecheck`

**Implementation notes**: использовать `pnpm create next-app@latest` с флагами TS, Tailwind, App Router, src dir, eslint, no Turbopack (стабильности ради).

---

#### TICKET-P0-02 ✅ — Linting and formatting (PR #2)

**Scope**: `eslint.config.mjs`, `.prettierrc`, package.json scripts
**Deliverable**: рабочий lint + format pipeline
**Acceptance**:
- `pnpm lint` и `pnpm format` доступны как скрипты
- Prettier настроен на 100 символов, single quotes, no semi
- ESLint расширяет `next/core-web-vitals` и `next/typescript`
- Добавить скрипт `pnpm typecheck` (`tsc --noEmit`)

**Depends on**: P0-01

---

#### TICKET-P0-03 ✅ — shadcn/ui setup (PR #3)

**Scope**: `components.json`, `src/components/ui/`
**Deliverable**: shadcn/ui инициализирован, базовые компоненты добавлены
**Acceptance**:
- `pnpm dlx shadcn@latest init` выполнен
- Тема: neutral, css variables: yes
- Добавлены компоненты: `button`, `input`, `label`, `card`, `dialog`, `tabs`, `toast`/`sonner`, `dropdown-menu`, `select`, `alert`
- На главной странице отрисован один компонент для проверки

**Depends on**: P0-01

---

#### TICKET-P0-04 ✅ — Prisma + Postgres setup (PR #5)

**Scope**: `prisma/`, `src/db/`, `.env.example`
**Deliverable**: подключение к Neon, рабочий `db/client.ts`
**Acceptance**:
- `prisma/schema.prisma` инициализирован под Postgres
- `src/db/client.ts` экспортирует singleton PrismaClient (с защитой от двойного инстанса в dev)
- `.env.example` содержит `DATABASE_URL` без секретов
- README обновлён инструкцией: «как создать БД на Neon, как заполнить `.env.local`»
- `pnpm prisma generate` отрабатывает

**Notes**: NeON выдаёт два URL — pooled (для приложения) и direct (для миграций). Использовать `DATABASE_URL` для pooled и `DIRECT_URL` для миграций (см. `directUrl` в `datasource`).

---

#### TICKET-P0-05 ✅ — Base layout and theming (PR #6)

**Scope**: `src/app/layout.tsx`, `src/components/theme-provider.tsx`
**Deliverable**: базовый layout с тёмной темой
**Acceptance**:
- Заголовок страницы: «Голосование за песню»
- Шрифт — `Geist` или `Inter` через `next/font`
- Переключатель темы в углу (light/dark/system) через `next-themes`
- Контейнер по центру `max-w-3xl`, респонсивные отступы

**Depends on**: P0-03

---

#### TICKET-P0-06 ✅ — CLAUDE.md and docs (this PR)

**Scope**: `CLAUDE.md` (корень), `docs/ARCHITECTURE.md`
**Deliverable**: документация для последующих сессий Claude Code
**Acceptance**:
- `CLAUDE.md` содержит: однопараграфный обзор, команды, файловую структуру, ссылки на `docs/ARCHITECTURE.md` и `docs/ROADMAP.md`, перечень конвенций
- `docs/ARCHITECTURE.md` содержит: модель данных (Prisma-like), API endpoints с payload shapes, state machine этапов, auth-флоу, formula скоринга
- Обновить `docs/ROADMAP.md` (этот файл): отметить ✅ для всех тикетов фазы 0

**Implementation notes**: попроси оркестратора (меня) предоставить контент для `ARCHITECTURE.md` — я заготовлю его после того, как репо создано и фаза 0 идёт. До того момента документ можно создать с TODO-метками.

---

### Phase 1 — Data layer

Цель: рабочая БД с миграциями и типизированным доступом.

#### TICKET-P1-01 🟡 — Prisma schema

**Scope**: `prisma/schema.prisma`
**Deliverable**: полная схема данных
**Acceptance**:
- Модели: `Session`, `Participant`, `Track`, `Vote`
- Поля и типы — по архитектурному снимку (см. выше + `docs/ARCHITECTURE.md`)
- Связи: `Session` → `Participant[]`, `Session` → `Track[]`, `Session` → `Vote[]`, `Participant` → `Track[]` (submittedBy), `Participant` → `Vote[]`, `Track` → `Vote[]`
- UNIQUE indexes:
  - `Participant`: `(sessionId, accessKeyHash)`
  - `Vote`: `(participantId, rank)`, `(participantId, trackId)`
- Поля `createdAt`/`updatedAt` через `@default(now())` и `@updatedAt`
- `stage` как enum `SessionStage` (`SETUP`, `STAGE1`, `STAGE2`, `FINISHED`)

**Depends on**: P0-04

---

#### TICKET-P1-02 ⬜ — Migration and seed

**Scope**: `prisma/migrations/`, `prisma/seed.ts`
**Deliverable**: первая миграция + seed скрипт для dev
**Acceptance**:
- `pnpm prisma migrate dev --name init` создаёт миграцию
- `prisma/seed.ts` создаёт одну тестовую сессию + 3 участников + 6 треков + (опц.) голоса для проверки stage2 UI
- В `package.json`: `"prisma": { "seed": "tsx prisma/seed.ts" }`
- README обновлён: команда `pnpm prisma db seed`

**Depends on**: P1-01

---

#### TICKET-P1-03 ⬜ — Repository helpers

**Scope**: `src/db/repos/`
**Deliverable**: набор функций доступа к данным, скрывающих Prisma
**Acceptance**:
- `src/db/repos/session.ts`: `getActiveSession()`, `createSession(...)`, `updateSessionStage(id, stage)`
- `src/db/repos/participant.ts`: `getParticipantByKeyHash`, `listParticipants(sessionId)`, `createParticipants(sessionId, count)`, `renameParticipant`, `deleteParticipant`
- `src/db/repos/track.ts`: `listTracks(sessionId)`, `createTrack(...)`, `deleteTrack(id, ownerId)`, `countTracksByParticipant`
- `src/db/repos/vote.ts`: `upsertVote(participantId, trackId, rank)`, `deleteVote(participantId, rank)`, `listVotesByParticipant`, `listAllVotes(sessionId)`
- Все функции — типизированы, без `any`. Возвращают чистые объекты без приватных полей (в первую очередь без `accessKeyHash`).

**Depends on**: P1-01

---

### Phase 2 — Auth

Цель: рабочий вход для админа и участника, защита API-роутов.

#### TICKET-P2-01 ⬜ — Crypto utilities

**Scope**: `src/lib/crypto.ts`
**Deliverable**: утилиты хеширования и генерации ключей
**Acceptance**:
- `hashPassword(plain)` / `verifyPassword(plain, hash)` через bcrypt (работа в Node runtime)
- `hashKey(plain)` через SHA-256 (быстрее, без brute-force защиты — для участников ОК)
- `generateAccessKey()` — 8 символов из алфавита без I/O/0/1, через `crypto.randomBytes`
- Юнит-тесты на чистые функции (vitest)

**Depends on**: P0-01

---

#### TICKET-P2-02 ⬜ — JWT and session cookies

**Scope**: `src/lib/auth/jwt.ts`, `src/lib/auth/cookies.ts`
**Deliverable**: подпись/проверка токенов, set/clear cookie
**Acceptance**:
- `signToken(payload)` / `verifyToken(token)` через `jose` (Edge-compatible)
- Payload: `{ kind: 'admin' | 'participant', sessionId, participantId? }`, exp = 24ч
- `JWT_SECRET` из env, в `.env.example` добавлено
- `setSessionCookie(token)` / `clearSessionCookie()` / `getTokenFromRequest(req)`
- Cookie: httpOnly, sameSite=lax, secure в проде, path=/

---

#### TICKET-P2-03 ⬜ — Auth middleware

**Scope**: `src/middleware.ts`, `src/lib/auth/guards.ts`
**Deliverable**: защита роутов, хелпер `getSessionUser()` для API
**Acceptance**:
- `middleware.ts` пропускает все запросы, но кладёт распарсенный токен в request headers
- `getSessionUser(req): { kind, sessionId, participantId? } | null` для использования в API-роутах
- `requireAdmin(req)` / `requireParticipant(req)` — кидают 401, если не авторизован
- Юнит-тесты на guards с моком cookie

**Depends on**: P2-02

---

#### TICKET-P2-04 ⬜ — Admin login endpoint

**Scope**: `src/app/api/auth/admin/route.ts`, `src/app/api/auth/logout/route.ts`
**Deliverable**: POST /api/auth/admin, POST /api/auth/logout
**Acceptance**:
- POST /api/auth/admin с `{ password }` — проверяет хеш, ставит cookie, возвращает `{ ok: true }`
- При неправильном пароле: 401 + `{ ok: false, error: { code: 'INVALID_PASSWORD' } }`
- Rate-limit: после 5 неуспешных попыток — 429 на 5 минут (in-memory, по IP). Для one-shot тула этого хватит.
- POST /api/auth/logout — чистит cookie

**Depends on**: P2-01, P2-02, P2-03, P1-03

---

#### TICKET-P2-05 ⬜ — Participant login endpoint

**Scope**: `src/app/api/auth/participant/route.ts`
**Deliverable**: POST /api/auth/participant
**Acceptance**:
- Принимает `{ accessKey }`, хеширует, ищет участника по `accessKeyHash`
- Если найден — ставит cookie, обновляет `lastSeenAt`, ставит `hasJoined = true`, возвращает `{ ok: true, participant: { id, displayName } }`
- Если не найден — 401, `INVALID_KEY`
- Тот же rate-limit, что у админа

**Depends on**: P2-01, P2-02, P1-03

---

### Phase 3 — Setup & admin core

Цель: админ может создать сессию, сгенерировать ключи, видеть участников.

#### TICKET-P3-01 ⬜ — Setup screen

**Scope**: `src/app/setup/page.tsx`, `src/app/api/setup/route.ts`
**Deliverable**: первоначальная настройка (если активной сессии нет)
**Acceptance**:
- На `/` редирект на `/setup`, если в БД нет сессии
- Форма: пароль, повтор пароля, число участников (2–30)
- POST /api/setup создаёт `Session` (stage = STAGE1) + N `Participant` записей с захешированными ключами
- Возвращает админу список ключей (один раз!) + ставит admin cookie
- Экран после создания: список ключей с кнопкой «скопировать все» и «скопировать каждый отдельно»
- Предупреждение: «Сохраните ключи сейчас — после ухода со страницы их можно будет регенерировать только заново».

**Depends on**: P2-04, P1-03, P0-05

**Implementation notes**: ключи участников хешируем (SHA-256 от plain). Возвращаем plain только в ответе POST /api/setup и аналогичного эндпоинта на регенерацию. После этого они недоступны.

---

#### TICKET-P3-02 ⬜ — Login page

**Scope**: `src/app/login/page.tsx`
**Deliverable**: страница входа с двумя табами
**Acceptance**:
- Если нет активной сессии — редирект на `/setup`
- Таб «Я админ»: пароль + кнопка
- Таб «У меня ключ»: ключ + кнопка
- Ошибки показываются inline (toast или alert)
- Успешный вход админа → `/admin`, успешный вход участника → `/`

**Depends on**: P2-04, P2-05, P0-03

---

#### TICKET-P3-03 ⬜ — Admin dashboard layout

**Scope**: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`
**Deliverable**: каркас админки с навигацией
**Acceptance**:
- `layout.tsx` проверяет admin auth, иначе редирект на `/login`
- Шапка: название сессии, бейдж текущего этапа, кнопка logout
- Левый сайдбар или табы: «Участники», «Треки», «Голоса» (последние два — placeholder в этом тикете)
- На `/admin` (главной админки) — короткий обзор: количество участников, треков, голосов, текущий этап

**Depends on**: P2-03, P0-03

---

#### TICKET-P3-04 ⬜ — Participants management

**Scope**: `src/app/admin/participants/page.tsx`, `src/app/api/admin/participants/route.ts`, `src/app/api/admin/participants/[id]/route.ts`
**Deliverable**: страница управления участниками
**Acceptance**:
- Таблица: displayName (inline editable), статус (joined/not), createdAt
- Кнопка «Сгенерировать ещё ключи» — модалка с числом, после генерации показывает новые ключи (один раз)
- Кнопка «Регенерировать ключ» на участнике (с подтверждением, старый ключ становится недействительным)
- Кнопка «Удалить участника» (с подтверждением, удаляет также его треки и голоса каскадом)
- Все действия защищены `requireAdmin`

**Depends on**: P3-03, P1-03

---

### Phase 4 — Stage 1 (submissions)

Цель: участники могут добавить до 3 треков, видеть пул.

#### TICKET-P4-01 ⬜ — Track API endpoints

**Scope**: `src/app/api/tracks/route.ts`, `src/app/api/tracks/[id]/route.ts`
**Deliverable**: REST для треков
**Acceptance**:
- POST /api/tracks (participant only): валидация Zod (title required, ≤120, artist ≤120, url URL, description ≤500), проверка `stage === STAGE1`, проверка лимита 3, создаёт запись, возвращает трек
- GET /api/tracks: возвращает список треков. Для участников включает submitter displayName. Для админа — всё.
- DELETE /api/tracks/:id (participant): только свои треки, только в stage1
- PATCH /api/tracks/:id (participant): редактирование своего трека в stage1

**Depends on**: P2-03, P1-03

**Implementation notes**: stage gating — отдельный helper `assertStage(session, ...allowedStages)`. Никакой проверки stage в route handler-е без этого хелпера, чтобы не расходиться.

---

#### TICKET-P4-01b ⬜ — Track metadata schema migration

**Scope**: prisma/schema.prisma, prisma/migrations/

**Deliverable**: extend Track model with service/serviceTrackId/coverUrl/embedSupported

**Acceptance**:
- prisma/schema.prisma Track model has the four new fields per ARCHITECTURE.md
- `pnpm prisma migrate dev --name add_track_metadata` produces a migration file
- Migration is committed under prisma/migrations/
- pnpm db:generate succeeds, TS imports of Track include new fields
- pnpm lint, format:check, typecheck, build all pass
- Seed (prisma/seed.ts from P1-02) updated to set service/coverUrl on existing seeded tracks (use any plausible Yandex Music URL + matching cover image URL — these don't need to be real, just non-null for UI testing)

**Depends on**: P1-02

**Implementation notes**: this ticket only adds DB columns and migration. Parsing logic and UI come in P4-04 and P4-05.

---

#### TICKET-P4-02 ⬜ — Participant home + stage 1 UI

**Scope**: `src/app/page.tsx`, `src/app/(participant)/...`
**Deliverable**: основной экран участника на этапе 1
**Acceptance**:
- На `/` если participant залогинен и stage = STAGE1: показать «мои треки» (0–3) и «весь пул»
- Кнопка «Добавить трек» открывает диалог с формой
- Форма: title (required), artist, url (с валидацией), description (textarea)
- Inline-индикатор «осталось N треков»
- Список «весь пул»: title, artist, who submitted, описание (collapsed)
- Возможность редактировать/удалить свой трек кнопками на карточке
- Track cards render the TrackEmbed component (per P4-05) — wire the integration when P4-05 lands; this ticket can ship with a placeholder if P4-05 isn't merged yet.

**Depends on**: P4-01, P0-03

---

#### TICKET-P4-03 ⬜ — Admin tracks view

**Scope**: `src/app/admin/tracks/page.tsx`
**Deliverable**: страница админа с полным списком треков
**Acceptance**:
- Таблица всех треков с автором, временем добавления
- Возможность модерировать (удалять) любой трек
- Сортировка по автору / времени
- Счётчик: «всего треков N, авторов M»

**Depends on**: P3-03, P4-01

---

#### TICKET-P4-04 ⬜ — Track URL parser and metadata fetcher

**Scope**: src/lib/track-url.ts, src/app/api/tracks/preview/route.ts

**Deliverable**: detectService() pure function + metadata-extraction endpoint

**Acceptance**:
- src/lib/track-url.ts exports detectService(url) per ARCHITECTURE.md "Track URL Handling"
- Unit tests cover: a real URL from each supported service (yandex track, yandex album+track, spotify, youtube, youtu.be short, youtube music), VK audio URL (returns vk kind, null embed), unparseable garbage (returns null)
- src/lib/track-metadata.ts exports fetchOgMetadata(url) — server-side fetch + OG tag parse, 5s timeout, fail-soft (returns empty object on failure)
- POST /api/tracks/preview accepts { url }, runs detectService + fetchOgMetadata in parallel, returns combined response per ARCHITECTURE.md
- Endpoint protected by requireParticipant + assertStage(STAGE1)
- Use a small HTML parser (cheerio or htmlparser2) — install whichever is lighter and well-typed
- Generic User-Agent: "voteSite/1.0 (+metadata-fetch)" — services that block this are accepted as unsupported
- pnpm lint, format:check, typecheck, build all pass
- Unit tests pass

**Depends on**: P4-01b, P2-03

**Implementation notes**: do NOT pull spotify/yandex/youtube SDKs. Just URL pattern matching + OG scraping. Lighter, no API keys, no rate-limit handshakes.

---

#### TICKET-P4-05 ⬜ — Track form with URL preview and embed player component

**Scope**: src/components/track-form.tsx, src/components/track-card.tsx, src/components/track-embed.tsx, integration into existing track UIs

**Deliverable**: URL-first track submission flow + embedded player rendering

**Acceptance**:
- TrackForm: URL field is the first input. On blur (or after 800ms debounce), POST /api/tracks/preview is called and the response auto-fills title/artist/coverUrl. Loading state during fetch, error toast on failure.
- User can override auto-filled title and artist before submit. coverUrl is not user-editable in this version.
- TrackEmbed component renders:
  - For embedSupported=true: <iframe> with the appropriate src per service (yandex/spotify/youtube). Sized appropriately on mobile and desktop.
  - For embedSupported=false: a clickable card with cover image (if any), title, artist, and an "Открыть" button that links out in a new tab.
- TrackCard uses TrackEmbed below the track metadata.
- Both stage 1 (own + pool) and stage 2 (voting) UIs render TrackCard with embed.
- Embed iframes have proper sandbox attributes and loading="lazy".
- pnpm lint, format:check, typecheck, build all pass

**Depends on**: P4-04, P4-02 (existing track UI to integrate into)

---

### Phase 5 — Stage transitions

Цель: админ может переключать этапы с защитой от ошибок.

#### TICKET-P5-01 ⬜ — Stage transition endpoint

**Scope**: `src/app/api/admin/stage/route.ts`, `src/lib/stage.ts`
**Deliverable**: POST /api/admin/stage с валидацией
**Acceptance**:
- `src/lib/stage.ts` содержит чистую функцию `canTransition(from, to): boolean` и список разрешённых переходов
- POST /api/admin/stage `{ to: 'stage2' | 'finished' | 'stage1' }` — проверяет переход, проверяет prerequisites (например, переход в stage2 требует ≥3 треков и ≥2 авторов), обновляет
- Откат `stage2 → stage1` НЕ удаляет голоса (просто меняет stage)
- Откат `finished → stage2` — разрешён, но с бейджем-предупреждением «голосование уже было закрыто»
- Юнит-тесты на `canTransition` и `getTransitionRequirements`

**Depends on**: P2-03

---

#### TICKET-P5-02 ⬜ — Stage controls in admin

**Scope**: `src/app/admin/page.tsx`, `src/components/stage-controls.tsx`
**Deliverable**: UI для переключения этапов
**Acceptance**:
- На главной админки: текущий этап + кнопка «Перейти к ...» с подтверждением
- Если prerequisites не выполнены — кнопка отключена с подсказкой («нужно ≥3 треков от ≥2 авторов»)
- Подтверждающая модалка перечисляет последствия («после этого участники больше не смогут добавлять треки»)
- При откате — отдельная модалка с дополнительным предупреждением

**Depends on**: P5-01, P3-03

---

#### TICKET-P5-03 ⬜ — Stage indicator everywhere

**Scope**: `src/components/stage-badge.tsx`, integration в layouts
**Deliverable**: визуальный индикатор этапа везде
**Acceptance**:
- Компонент с цветовой схемой: setup (серый), stage1 (синий), stage2 (фиолетовый), finished (зелёный)
- Размещён в шапке и админки, и участников
- Иконки и/или эмодзи опционально

**Depends on**: P0-05

---

### Phase 6 — Stage 2 (voting)

Цель: участники голосуют по топ-3, голоса сохраняются автоматически.

#### TICKET-P6-01 ⬜ — Vote API endpoints

**Scope**: `src/app/api/votes/route.ts`, `src/app/api/votes/[rank]/route.ts`
**Deliverable**: API для голосов
**Acceptance**:
- PUT /api/votes (participant) `{ trackId, rank: 1|2|3 }`: upsert-ит голос. Если у участника уже есть голос на этом ранге — заменяется. Если этот трек уже стоит на другом ранге — старый ранг для этого трека снимается (один трек = один ранг у одного участника).
- DELETE /api/votes/:rank — снимает голос с конкретного ранга
- GET /api/votes/me — мои голоса
- Все защищены `requireParticipant` + `assertStage(STAGE2)`

**Depends on**: P2-03, P1-03

**Implementation notes**: транзакция: «снять старый голос на этом ранге у этого участника» + «снять старый голос за этот трек у этого участника» + «вставить новый голос». Иначе UNIQUE constraint выстрелит.

---

#### TICKET-P6-02 ⬜ — Voting UI

**Scope**: `src/app/(participant)/vote/page.tsx`, `src/components/track-rank-selector.tsx`
**Deliverable**: страница голосования
**Acceptance**:
- На `/` при stage=STAGE2 редирект на `/vote` (или показ внутри той же страницы)
- Список всех треков карточками
- На каждой карточке селектор: «не выбрано / 🥇 1-е / 🥈 2-е / 🥉 3-е»
- При выборе ранга — оптимистично обновляется UI, отправляется PUT /api/votes
- Если ранг уже занят другим треком — этот трек теряет свой ранг (визуально становится «не выбрано»), пользователю показывается toast «Заменили ранг»
- Sticky-панель сверху или сбоку: «Ваш топ-3» с текущими выборами
- Можно проголосовать неполным топом

**Depends on**: P6-01, P0-03

---

#### TICKET-P6-03 ⬜ — Polling for live updates

**Scope**: `src/lib/use-poll.ts`, integration in vote page and admin
**Deliverable**: хук для регулярного pull-а
**Acceptance**:
- `usePoll(url, intervalMs)` — fetch-ит JSON с интервалом, останавливается на unmount, паузит при `document.hidden`
- Используется на странице голосования (для обновления списка треков, если админ что-то удалил)
- Используется на админских страницах (для свежих голосов и треков)
- Интервал: 5 секунд по дефолту

**Depends on**: P0-01

---

### Phase 7 — Results

Цель: подсчёт результатов, отображение для админа, опционально для участников.

#### TICKET-P7-01 ⬜ — Scoring computation

**Scope**: `src/lib/scoring.ts`
**Deliverable**: чистая функция подсчёта результатов
**Acceptance**:
- `computeResults(tracks, votes): TrackResult[]` где `TrackResult = { trackId, points, voters, perRank: { 1, 2, 3 } }`
- Скоринг: rank=1 → 3pts, rank=2 → 2pts, rank=3 → 1pt
- Сортировка по `points` desc, при равенстве — по `perRank[1]` desc, затем `perRank[2]` desc, затем алфавитно по title
- Юнит-тесты с разными комбинациями голосов

**Depends on**: P0-01

---

#### TICKET-P7-02 ⬜ — Admin results dashboard

**Scope**: `src/app/admin/results/page.tsx`, `src/app/api/admin/results/route.ts`
**Deliverable**: страница с результатами для админа
**Acceptance**:
- GET /api/admin/results возвращает `TrackResult[]` + информацию «кто за что проголосовал» (для аудита)
- Страница: bar chart (recharts) — points по трекам
- Таблица под графиком: ранг, трек, автор, points, voters, разбивка по местам
- Доступна на всех stage начиная с STAGE1 (на STAGE1 — пусто, на STAGE2 — промежуточные результаты)
- Видно матрицу «участник × трек → ранг» (свернутая, по клику разворачивается)

**Depends on**: P7-01, P3-03

---

#### TICKET-P7-03 ⬜ — Reveal results to participants

**Scope**: `src/app/api/admin/settings/route.ts`, UI toggle
**Deliverable**: переключатель раскрытия результатов
**Acceptance**:
- В Session.settings добавлено поле `revealResults: boolean` (default false)
- PATCH /api/admin/settings `{ revealResults }` (только для админа, только когда stage=FINISHED)
- На странице результатов админа — switch «показать участникам»
- При включенном свитче — участники в `/` видят результаты после finished

**Depends on**: P7-02

---

#### TICKET-P7-04 ⬜ — Participant results view

**Scope**: `src/app/(participant)/results/page.tsx`
**Deliverable**: страница результатов для участников
**Acceptance**:
- При stage=FINISHED:
  - если `revealResults=false` — показать «Голосование завершено. Ждём, пока админ опубликует результаты.»
  - если `revealResults=true` — тот же график и таблица, что у админа, но без матрицы голосов и без аудита
- На stage<FINISHED — этой страницы нет (404 или редирект)

**Depends on**: P7-03

---

#### TICKET-P7-05 ⬜ — CSV export

**Scope**: `src/app/api/admin/results/export/route.ts`
**Deliverable**: экспорт результатов в CSV
**Acceptance**:
- GET /api/admin/results/export — отдаёт CSV: `rank, title, artist, submittedBy, points, voters, votes_1st, votes_2nd, votes_3rd`
- На странице результатов админа — кнопка «Скачать CSV»
- Имя файла: `results-{sessionId}-{date}.csv`

**Depends on**: P7-02

---

### Phase 8 — Polish

Тикеты, без которых жить можно, но с которыми приятнее. Делать после P0–P7.

#### TICKET-P8-01 ⬜ — Mobile responsiveness pass

**Scope**: все страницы
**Deliverable**: чек-лист ниже отработан
**Acceptance**:
- Все страницы выглядят хорошо на 375px ширине
- Шапка с логином/выходом работает на мобилке
- Формы — нативные мобильные клавиатуры (type=email где нужно, autocomplete)
- Sticky-панель «Ваш топ-3» на мобилке — снизу с возможностью свернуть

---

#### TICKET-P8-02 ⬜ — Empty/error/loading states

**Scope**: все страницы
**Deliverable**: единообразные состояния
**Acceptance**:
- Скелетон-лоадеры на всех таблицах и списках
- «Пока пусто» состояния с CTA
- Ошибки API показываются в toast с понятным сообщением (не «Failed to fetch»)

---

#### TICKET-P8-03 ⬜ — Audit log

**Scope**: `prisma/schema.prisma` (расширение), `src/lib/audit.ts`, страница в админке
**Deliverable**: журнал действий
**Acceptance**:
- Модель `AuditEntry` (sessionId, actorId, actorKind, action, payload JSON, createdAt)
- Все админские действия + переходы этапов + удаления пишут запись
- В админке — страница «Журнал» с фильтрами

---

#### TICKET-P8-04 ⬜ — Reset session

**Scope**: `src/app/api/admin/reset/route.ts`, UI
**Deliverable**: возможность начать с нуля
**Acceptance**:
- POST /api/admin/reset с подтверждением «введите название сессии», удаляет всё (сессия + участники + треки + голоса) и редиректит на `/setup`
- Доступно только админу
- Аудит-запись о факте сброса (если P8-03 уже сделан)

---

## Открытые вопросы / parking lot

Тикеты, которые могут возникнуть по ходу:

- ❓ Что делать, если БД уроняли и `prisma migrate` фейлится в проде? Сейчас полагаемся на Neon branching, но workflow не описан.
- ❓ Email/SMS приглашения участникам с их ключом? Сейчас — copy-paste ручками.
- ❓ Многосессионность (несколько голосований параллельно). Сейчас — одна активная сессия.
- ❓ Embed Spotify/YouTube для треков (oEmbed).
- ❓ Анонимный режим (имена авторов треков скрыты от других участников).

---

## Sanity-чек на тонкость срезов

Проверка на «MVP за минимум тикетов»: какие тикеты обязательны, чтобы один человек смог провести голосование от начала до конца?

P0-01..05, P1-01..03, P2-01..05, P3-01, P3-02, P3-03, P4-01, P4-01b, P4-02, P4-04, P4-05, P5-01, P5-02, P6-01, P6-02, P7-01, P7-02 — **итого ~25 тикетов**. (P4-01b, P4-04, P4-05 — это MVP, потому что embed-плеер для треков подтверждён; без него experience заметно слабее.)

P3-04, P4-03, P5-03, P6-03, P7-03, P7-04, P7-05 — quality-of-life, но не блокируют.

P8-* — после первого реального прогона.

---

## Что нужно от меня (оркестратора) при старте

1. После создания репо — `docs/ARCHITECTURE.md` с детальным описанием API, схемы и auth flow (тикет P0-06 опирается на это). Я подготовлю как только увижу `package.json` репо — чтобы версии зависимостей сошлись.
2. Контент `CLAUDE.md` — чтобы Claude Code сессии стартовали с одинакового базиса.
3. По каждому тикету — review и финальный «✅ DONE» в этом файле.
