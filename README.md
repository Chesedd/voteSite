# voteSite

Web app for collaborative song voting. Sessions, ranked top-3 voting, admin dashboard.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full plan and ticket breakdown.

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS v4
- pnpm
- Prisma ORM + Postgres (Neon)

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server on `http://localhost:3000` |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run `tsc --noEmit` |
| `pnpm db:generate` | Generate the Prisma client into `node_modules/@prisma/client` |
| `pnpm db:studio` | Open Prisma Studio against the configured database |

## Project structure

```
src/
  app/         # App Router routes
  components/  # Shared UI components
  db/          # Prisma client + repository helpers
  lib/         # Business logic, helpers
prisma/        # Prisma schema and migrations
docs/          # Roadmap and architecture docs
```

## Getting started

```bash
pnpm install
pnpm dev
```

## Database setup

The app talks to Postgres via Prisma. We use [Neon](https://neon.tech) for a free serverless Postgres, but any Postgres works.

1. **Create a Neon project.** Sign in at [console.neon.tech](https://console.neon.tech) and create a new project. Pick the region closest to where the app is deployed.
2. **Get both connection URLs.** In the Neon dashboard, under *Connection Details*, copy:
   - the **pooled** connection string (uses `-pooler` in the host) — this is your `DATABASE_URL`
   - the **direct** connection string (no pooler) — this is your `DIRECT_URL`

   Prisma uses the pooled URL for runtime queries and the direct URL for migrations and introspection.
3. **Create your local env file.**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `DATABASE_URL` and `DIRECT_URL` with the values from Neon. `.env.local` is git-ignored.
4. **Generate the Prisma client.**
   ```bash
   pnpm db:generate
   ```
   Run this whenever `prisma/schema.prisma` changes.
5. **(Optional) Open Prisma Studio.**
   ```bash
   pnpm db:studio
   ```

The schema currently has no models — those land in ticket P1-01.
