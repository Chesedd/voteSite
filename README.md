# voteSite

Web app for collaborative song voting. Sessions, ranked top-3 voting, admin dashboard.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full plan and ticket breakdown.

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS v4
- pnpm

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server on `http://localhost:3000` |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run `tsc --noEmit` |

## Project structure

```
src/
  app/         # App Router routes
  components/  # Shared UI components
  lib/         # Business logic, helpers
docs/          # Roadmap and architecture docs
```

## Getting started

```bash
pnpm install
pnpm dev
```
