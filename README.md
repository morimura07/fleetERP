# FleetERP

Transport & Logistics ERP for the East/Central African freight corridors, built to the
project SRS (36 functional modules patterned after Dynamics 365). This repository is a
TypeScript monorepo.

## Stack

| Layer    | Technology                                   |
|----------|----------------------------------------------|
| Web      | Next.js 15 (App Router, React 19), Tailwind, Recharts, lucide-react |
| API      | NestJS 11, Passport JWT, RBAC guards         |
| Data     | PostgreSQL + Prisma ORM                       |
| Shared   | `@fleeterp/shared` — module registry, roles, DTO types |
| Tooling  | pnpm workspaces                               |

## Layout

```
apps/
  api/    NestJS API (auth, dashboard, Prisma schema + seed)
  web/    Next.js front-end (login, dashboard shell, executive dashboard)
packages/
  shared/ Cross-cutting types + the 36-module registry and RBAC roles
```

## Phase 1 (current)

Foundation + Executive Dashboard:
- Multi-entity (`Data_Area_ID`) data model with the SRS §1.1 global audit fields on every record
- JWT auth + 4 RBAC roles (§4.1), role-filtered navigation over all 36 modules
- Executive Control & Operations Dashboard (§6): KPI cards, recovery/obligation gauges,
  fuel-efficiency chart, maintenance arc, bookings pipeline, and regulatory document
  lifecycle tracking — all computed live from the database.

Modules 1–36 are present in navigation and the access model; their detailed screens are
planned for later phases.

## Getting started

Prerequisites: Node ≥ 20, pnpm, and a PostgreSQL database (e.g. Neon or Supabase).

```bash
pnpm install

# 1. Configure the API
cp apps/api/.env.example apps/api/.env
#   → set DATABASE_URL to your Postgres connection string and a JWT_SECRET

# 2. Configure the web app
cp apps/web/.env.local.example apps/web/.env.local

# 3. Build shared, generate the Prisma client, migrate and seed
pnpm --filter @fleeterp/shared build
pnpm db:migrate
pnpm db:seed

# 4. Run both apps (web on :3000, API on :4000)
pnpm dev
```

Open http://localhost:3000 and sign in with a demo account (also listed on the login page):

| Role               | Email                     | Password       |
|--------------------|---------------------------|----------------|
| System Admin       | admin@fleeterp.co.tz      | Admin@2026     |
| Operations Planner | ops@fleeterp.co.tz        | Ops@2026       |
| Finance Controller | finance@fleeterp.co.tz    | Finance@2026   |
| Workshop Manager   | workshop@fleeterp.co.tz   | Workshop@2026  |

Each role sees only the module groups it is authorized for (System Admin sees all 36).
