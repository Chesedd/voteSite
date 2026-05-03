# CLAUDE.md

## Project: Song Voting Webapp

A two-stage song voting app for small groups (5–20 people). Admin generates one-time access keys; participants submit up to 3 tracks each (stage 1), then rank a top-3 from the pool (stage 2). Admin sees results always; participants see them only after admin reveals.

The full plan lives in `docs/ROADMAP.md` (tickets, phases, statuses). Architecture details — data model, API contracts, auth flow, conventions — are in `docs/ARCHITECTURE.md`. Read both before starting any non-trivial work.

## Quick Start

```bash
pnpm install
cp .env.example .env.local # fill DATABASE_URL and DIRECT_URL from Neon
pnpm db:migrate --name init # run once on first setup
pnpm dev                    # http://localhost:3000
```

Prisma scripts are wrapped with `dotenv-cli` so they read `.env.local` (the Prisma CLI itself only reads `.env`). Always invoke them via the `db:*` scripts, not `pnpm prisma ...` directly, or `DATABASE_URL` / `DIRECT_URL` will be missing.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint (next/core-web-vitals + next/typescript) |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check (CI-style) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest run (one-shot) |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:studio` | Open Prisma Studio in browser |
| `pnpm db:migrate` | `prisma migrate dev` (pass `--name <slug>` for new migrations) |
| `pnpm db:migrate:deploy` | `prisma migrate deploy` (production) |
| `pnpm db:seed` | Run `prisma/seed.ts` against the configured database |

Before pushing any PR: run `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`. All four must be clean.

## Project Layout

```
src/
  app/                # Next.js App Router routes
    api/              # API endpoints (route handlers)
    layout.tsx        # Root layout with theme provider, sonner
    page.tsx          # Home (router based on participant/admin/stage)
  components/
    ui/               # shadcn primitives — DO NOT edit by hand
    *.tsx             # App components, PascalCase.tsx
  lib/                # Business logic helpers, kebab-case.ts
    auth/             # JWT, cookies, guards
    crypto.ts         # Hashing, key generation
    stage.ts          # Stage transitions (pure)
    scoring.ts        # Vote → results (pure)
  db/                 # Prisma plumbing
    client.ts         # PrismaClient singleton
    repos/            # Typed data-access functions
docs/
  ROADMAP.md          # Master plan with tickets and statuses
  ARCHITECTURE.md     # Data model, API, auth, conventions
prisma/
  schema.prisma       # DB schema (Prisma 6.x)
  migrations/         # Auto-generated; commit them
  seed.ts             # Dev seed script (P1-02)
```

## Conventions

**TypeScript**: strict mode. No `any`. If you reach for `any`, stop and either narrow the type or use `unknown` with a type guard.

**API responses**: always one of two shapes:
- Success: `{ ok: true, data: ... }`
- Error: `{ ok: false, error: { code: string, message: string } }`

Never return raw values, never throw from a route handler without catching to this shape.

**Input validation**: every API input goes through a Zod schema before any business logic runs. No exceptions, no shortcuts for "trivial" inputs.

**Locales**:
- User-facing strings (UI labels, error messages shown to users, page titles): **Russian**.
- Code, comments, commit messages, logs, internal error codes: **English**.

**Components**: Server Components by default. Add `'use client'` only when you actually need state, effects, or browser APIs.

**Imports**: absolute via `@/` alias (e.g. `@/lib/auth/guards`). Avoid `../../..` chains.

**Stage gating**: every endpoint that depends on the current stage uses the `assertStage(session, ...allowedStages)` helper. Never write inline `if (session.stage !== 'STAGE1')` checks — they drift and miss cases.

**Hashing**:
- Admin password → bcrypt
- Participant access keys → SHA-256 (one-way; participants enter their key on every login, but we never store plaintext)

## Working on a Ticket

1. Open `docs/ROADMAP.md`, find the ticket (TICKET-PX-NN).
2. Read `docs/ARCHITECTURE.md` sections relevant to the ticket's subsystem.
3. Implement against the acceptance criteria — those are the contract.
4. Run all four checks (lint, format:check, typecheck, build).
5. For features with non-trivial logic (auth, stage transitions, scoring), add a unit test next to the module.
6. Open a draft PR. In the description, paste the acceptance criteria as a markdown checklist with each item checked.

## Out-of-Scope Discoveries

If you find something OUTSIDE the current ticket — a bug, a refactor opportunity, a missing test, a stale comment:

- **Do not fix it in the same PR.**
- Note it in the PR description under a `## Followups` section.
- The orchestrator will decide whether to create a separate ticket.

This rule is strict because PR scope creep is the #1 source of merge regret in this workflow.

## Known Sandbox / Operational Constraints

**ui.shadcn.com is blocked** in agent sandboxes. To add a shadcn component:

```bash
REGISTRY_URL=https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/public/r \
  pnpm dlx shadcn@latest add <component>
```

**pnpm postinstall scripts are opt-in** (security feature, pnpm v9+). The package.json already whitelists @prisma/client and prisma under pnpm.onlyBuiltDependencies. If you add another dependency that needs a build step (rare), add it to that list — otherwise pnpm install will silently skip its postinstall.

**Version pins** (do not bump without an explicit ticket):
- Next.js 15.5.x (not 16)
- Prisma 6.x (not 7 — Prisma 7 moved `url`/`directUrl` to `prisma.config.ts`)
- Tailwind v4 (CSS-based config — there is no `tailwind.config.js`)

**If a domain is blocked**: surface it in the PR description rather than silently working around it. Workarounds the orchestrator does not know about become invisible technical debt.
