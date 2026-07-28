# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `attached_assets/SIT_V10_Knowledge_Graph_Adapted.xlsx` — canonical SIT master data workbook.
- `artifacts/sit-demo/src/lib/kb-data.ts` — embedded frontend knowledge base generated from the SIT master data workbook.
- `artifacts/sit-demo/src/lib/knowledge-base.ts` — KB search, insight extraction, and uploaded workbook parsing logic.
- `artifacts/sit-demo/src/pages/chat.tsx` — main SIT demo chat experience.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- Live Koh Phangan event answers should prioritize `phangan.events` plus trusted local Instagram sources:
  `@phangan.events`, `@retromountainphangan`, `@_happy_people_events_`, `@phanganism`, `@bambuhuts`, `@edengarden_kohphangan`, `@holice___`, and `@secret.mountain.phangan`.

## User preferences

- Use the SIT master data workbook as the authoritative knowledge/data source when continuing the project.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
