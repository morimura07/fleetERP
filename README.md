# FleetFlow — Transport & Logistics ERP

An integrated ERP for cross-border logistics across the East & Central Africa trade corridors (Tanzania / Kenya / Uganda / Rwanda / Zambia / DRC). Built on a double-entry accounting core, it unifies order & trip (freight) management, dispatch, fleet & driver management, and role-based access control (RBAC).

> **UI language**: English (built for global operations).

---

## Table of Contents

1. [Key Features](#1-key-features)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Data Model](#4-data-model)
5. [Access Control (RBAC)](#5-access-control-rbac)
6. [Screens](#6-screens)
7. [Project Structure](#7-project-structure)
8. [Setup](#8-setup)
9. [Testing](#9-testing)
10. [Security](#10-security)
11. [Related Documentation](#11-related-documentation)

---

## 1. Key Features

### Accounting (double-entry)
- **Chart of Accounts** — Hierarchical asset / liability / equity / income / expense accounts, partitioned per legal entity (`dataAreaId`).
- **Journal** — Balanced double-entry postings with a draft → post → reverse lifecycle. Posted entries are immutable (audit requirement); corrections are made via contra-entries.
- **Multi-currency** — `Decimal(18,2)` amounts with an exchange rate recorded per posting.

### Freight operations
- **Orders** — Cross-border freight bookings with origin/destination zones, corridor type (Northern / Central / Domestic), freight & demurrage amounts, and currency.
- **Trips** — Execution of an order by driver + vehicle. Records route, mileage, and expenses, and computes **per-trip profit & loss (P&L)** automatically.
- **Accounting integration** — Invoicing an order posts accounts receivable (Dr A/R / Cr Freight Revenue); trip expenses post accounts payable (Dr Expense / Cr A/P) automatically.
- **Dispatch & daily reports** — Domestic delivery dispatch (with conflict checking) and driver daily reports.

### Management & analytics
- **Executive dashboard** — KPIs (utilization, bookings, receivables, trip P&L), financial gauges, and vehicle document-expiry tracking.
- **Audit log & notifications** — Every write operation is logged; drivers are notified of new dispatches.
- **Document exports** — Dispatch sheet, daily report, and monthly payment PDFs, plus jobs CSV.

---

## 2. System Architecture

The app is split into **two independently-deployable services** — a Next.js web
frontend and a standalone Hono API backend — that communicate over HTTP. The
**backend owns all database access**; the frontend holds no Prisma/DB dependency
and talks to the API with a JWT bearer token.

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (PC / Tablet / SP)                  │
│   shadcn/ui + React Hook Form + Zod (client-side validation)   │
└───────────────┬──────────────────────────────┬────────────────┘
   Server Comp. │ serverApi() (bearer)          │ apiFetch() (bearer)
                ▼                                ▼
┌──────────────────────────────────────────────────────────────┐         ┌──────────────────────────────────────────────┐
│             frontend/  — Next.js 15 (App Router)               │  HTTP   │            backend/  — Hono API                 │
│                                                                │ ──────▶ │                                                │
│  middleware.ts ── auth check + RBAC route guard (lib/rbac)     │  /api/* │  requireAuth + requirePermission (JWT, RBAC)   │
│  NextAuth (Auth.js v5) — login delegates to backend            │         │  routes/  — REST handlers (Zod validated)      │
│  Server Components — fetch initial data via serverApi()        │         │  services/  ledger | freight | dispatch | …    │
│  Client managers — mutate via apiFetch() (localStorage token)  │ ◀────── │  lib/  prisma | rbac | http | auth | mail | …  │
│  NO database access                                            │  JSON   │  unified error mapping (onError)               │
└────────────────────────────────────────────────────────────────┘        └───────────────┬──────────────────┬─────────────┘
                                                                                            │ Prisma ORM       │ nodemailer
                                                                                            ▼                  ▼
                                                                                    ┌──────────────┐   ┌──────────────┐
                                                                                    │  PostgreSQL  │   │   SMTP       │
                                                                                    └──────────────┘   └──────────────┘
```

**Layer responsibilities**

| Layer | Responsibility |
|-------|----------------|
| **frontend/middleware** | Redirect unauthenticated users, role-based route guards (`ROUTE_GUARDS`), isolate drivers to `/driver` |
| **frontend/Server Components** | Render initial data fetched from the backend via `serverApi()` (forwards the session's bearer token); the client mutates via `apiFetch()` |
| **frontend auth** | NextAuth credential login delegates to the backend's `POST /api/auth/login`; the returned token is carried in the NextAuth JWT and bridged to the client API wrapper |
| **backend/routes** | REST API. Per-call authorization via `requireAuth` + `requirePermission()` middleware, Zod validation, pagination/search/sort, exceptions → HTTP via `onError()` |
| **backend/services** | Framework-independent domain logic (double-entry balancing, trip P&L, dispatch conflict checks). Unit-tested |

---

## 3. Tech Stack

| Area | Technology |
|------|-----------|
| Frontend (`frontend/`) | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod — no DB dependency |
| Backend (`backend/`) | Hono (Node server), Prisma ORM, Zod |
| Database | PostgreSQL (works with managed Postgres such as Neon) — owned by the backend |
| Auth | NextAuth (Auth.js v5) on the web app; stateless JWT bearer tokens (`jose`) issued by the API; shared RBAC map |
| Accounting | In-house double-entry engine (`Decimal`-based, multi-currency) |
| Documents | PDFKit (PDF), PapaParse (CSV) — on the backend |
| Email | nodemailer (password reset) — on the backend |
| Testing | Vitest (unit & integration) — on the backend |
| UI/UX | Dark-first theme (light toggle), custom loading indicator |
| Deployment | Two Node services: `frontend` (`next build`/`next start`) + `backend` (`tsx src/main.ts`) |

---

## 4. Data Model

The Prisma schema (`prisma/schema.prisma`) defines **34 models**, grouped by domain:

**Auth & org**
- `User` (5 roles) / `ActivityLog` (audit log) / `Notification`

**Accounting**
- `Account` (chart of accounts) / `JournalEntry` (voucher) / `JournalLine` (line)

**Freight**
- `Order` / `Trip` / `TripExpense`

**Fleet & drivers**
- `Driver` / `DriverAvailability` / `Holiday` / `Vehicle` / `VehicleMaintenance`

**Domestic delivery & payroll**
- `Client` / `DeliveryJob` / `Dispatch` / `DailyReport` / `Payment`

**AP / AR (M1 / M2)**
- `Vendor` / `VendorInvoice` / `VendorPayment` / `Customer` / `CustomerInvoice` / `CustomerReceipt`

**Core Finance (M3 / M4 / M5 / multi-currency)**
- `Budget` / `BudgetLine` / `BankAccount` / `MoneyTransfer` / `ConsolidationMap` / `ExchangeRate`

**Operations (M11 / M12 / M30)**
- `DriverDocument` / `GpsWaypoint` / `VehiclePosition` (+ compliance & fuel fields on `Vehicle`/`Trip`)

> See [docs/DATABASE.md](docs/DATABASE.md) for detailed table definitions and relations, and [docs/PRD-STATUS.md](docs/PRD-STATUS.md) for the 36-module PRD coverage map.

---

## 5. Access Control (RBAC)

Permissions are centralized in a "role → permission" map in `lib/rbac.ts`, enforced in two layers: middleware (per route) and `requirePermission()` (per API).

| Role | Function | Main permissions |
|------|----------|------------------|
| **ADMIN** | System administrator | All permissions |
| **DISPATCHER** | Operations Planner | Create/edit orders, trips, dispatch, jobs; accounting is read-only |
| **FINANCE** | Finance Controller | Post/reverse journal entries, maintain accounts, invoice orders, finalize payments; operations are read-only; no user management |
| **DRIVER** | Driver | View own jobs and file daily reports (isolated to the driver portal) |
| **STAFF** | General staff | Read access to core data |

> **Separation of duties**: accounting authority (FINANCE) and operations editing (DISPATCHER) are kept separate. Invoicing and journal posting require finance permissions.

---

## 6. Screens

### Auth
| Path | Screen |
|------|--------|
| `/login` | Sign in |
| `/forgot-password` | Request password reset |
| `/reset-password` | Set new password |
| `/forbidden` | 403 (access denied) |

### Admin console `(admin)`
| Path | Screen | Primary roles |
|------|--------|---------------|
| `/dashboard` | Dashboard (KPIs, financial gauges, document expiry) | ADMIN, DISPATCHER, FINANCE, STAFF |
| `/orders` | Orders (CRUD, invoicing) | ADMIN, DISPATCHER (FINANCE: read + invoice) |
| `/trips` | Trips (CRUD, expenses, trip P&L) | ADMIN, DISPATCHER |
| `/accounts` | Chart of Accounts | ADMIN, FINANCE |
| `/ledger` | Journal (post / reverse) | ADMIN, FINANCE |
| `/vendors` · `/payables` | Vendors & AP bills (post, pay) | ADMIN, FINANCE |
| `/customers` · `/receivables` | Customers & AR invoices (post, receipt) | ADMIN, FINANCE |
| `/collections` | AR aging buckets | ADMIN, FINANCE, DISPATCHER, STAFF (read) |
| `/bank` | Cash & bank accounts + driver disbursements (M4) | ADMIN, FINANCE |
| `/budgets` | CapEx/OpEx budget control (M3) | ADMIN, FINANCE |
| `/tax` | VAT/WHT return preparation (M10) | ADMIN, FINANCE |
| `/fx` | Exchange rates — Spot/Average/Historical | ADMIN, FINANCE |
| `/consolidation` | Subsidiary→parent rollup (M5) | ADMIN, FINANCE |
| `/payments` | Monthly payment aggregation, finalize, PDF | ADMIN, FINANCE |
| `/jobs` | Delivery jobs CRUD (search, status filter, CSV) | ADMIN, DISPATCHER |
| `/dispatch` | Dispatch (free driver/vehicle lookup, conflict check, dispatch-sheet PDF) | ADMIN, DISPATCHER |
| `/drivers` · `/drivers/[id]` | Driver CRUD / availability & holidays | ADMIN |
| `/vehicles` | Vehicle CRUD + maintenance history | ADMIN |
| `/clients` | Client CRUD | ADMIN, DISPATCHER |
| `/compliance` | Document-expiry dashboard + fuel-efficiency monitor (M11) | ADMIN, DISPATCHER, FINANCE, STAFF |
| `/waypoints` | GPS waypoint registry (M30) | ADMIN, DISPATCHER |
| `/reports` | Daily report review (PDF export) | ADMIN, DISPATCHER, STAFF |
| `/activity` | Audit log | ADMIN |
| `/users` | User management | ADMIN |

### Driver portal `(driver)`
| Path | Screen |
|------|--------|
| `/driver` | Own jobs: today / upcoming / completed |
| `/driver/jobs/[id]` | Job detail + daily report submission (image upload) |

---

## 7. Project Structure

The repository holds **two self-contained, independently-deployable apps**
(`backend/` and `frontend/`), each with its own `package.json`, lockfile,
tsconfig, and `.env`. There is no workspace/monorepo manifest — they are built
and deployed separately.

```
fleetERP/
├─ backend/                  # @fleeterp/api — standalone Hono API (owns the DB)
│  ├─ package.json  tsconfig.json  .env.example  vitest.config.ts
│  ├─ prisma/
│  │  ├─ schema.prisma        # 34 model definitions
│  │  ├─ migrations/          # init / orders_trips / finance_role / accounting_ledger / ap_ar / core_finance / operations
│  │  └─ seed.ts              # seed data (users per role, chart of accounts, demo data)
│  ├─ uploads/                # proof-of-delivery images (served at /uploads)
│  ├─ src/
│  │  ├─ main.ts              # Hono bootstrap — CORS, static, mounts all routes under /api
│  │  ├─ lib/                 # prisma  rbac  http (ok/created/onError)  auth (JWT + guards)
│  │  │                       # validations  activity  notifications  mail  password  rate-limit  format  errors
│  │  ├─ services/            # ledger  freight  ap-ar  dispatch  payment  tax  collections
│  │  │                       # budget  cash-bank  fx  consolidation  compliance  fuel  dashboard  pdf  csv
│  │  └─ routes/              # one file per domain (orders, trips, ledger, payables, … 30 routers)
│  └─ tests/  unit/ + integration/
├─ frontend/                 # @fleeterp/web — standalone Next.js app (no DB dependency)
│  ├─ package.json  tsconfig.json  next.config.mjs  tailwind.config.ts  .env.example
│  ├─ middleware.ts           # auth + RBAC route guard (lib/rbac)
│  ├─ auth.ts / auth.config.ts  # NextAuth — login delegates to the backend, carries the bearer token
│  ├─ app/
│  │  ├─ (auth)/             # login / forgot-password / reset-password
│  │  ├─ (admin)/            # admin console (each screen has a loading.tsx skeleton)
│  │  ├─ (driver)/driver/    # driver portal
│  │  ├─ api/auth/[...nextauth]/  # the ONLY route handler kept (NextAuth)
│  │  └─ forbidden/          # 403
│  ├─ components/  ui/ (shadcn) · layout/ (sidebar, topbar, token-sync) · data/
│  └─ lib/  server-api.ts (SSR fetch) · fetcher.ts (client fetch) · auth-token.ts
│           rbac.ts · enums.ts · validations.ts · api-types.ts · labels.ts · utils.ts
└─ docs/                     # DATABASE.md, API.md, DEPLOY.md, MIGRATION.md, PRD-STATUS.md
```

---

## 8. Setup

### Prerequisites
- Node.js 20+
- PostgreSQL (local, or managed such as Neon)

### Backend (`backend/` — start this first)
```bash
cd backend
npm install
cp .env.example .env
#   Set DATABASE_URL, JWT_SECRET (openssl rand -base64 32), CORS_ORIGIN, PORT
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
npm run dev          # → http://localhost:4000/api
```

### Frontend (`frontend/`)
```bash
cd frontend
npm install
cp .env.example .env
#   Set AUTH_SECRET, API_URL + NEXT_PUBLIC_API_URL (→ the backend, e.g. http://localhost:4000)
npm run dev          # → http://localhost:3000
```

### Seeded logins
| Role | Email | Password |
|------|-------|----------|
| ADMIN | admin@fleetflow.local | admin1234 |
| DISPATCHER | dispatcher@fleetflow.local | dispatch1234 |
| FINANCE | finance@fleetflow.local | finance1234 |
| DRIVER | driver@fleetflow.local | driver1234 |
| STAFF | staff@fleetflow.local | staff1234 |

> The seed includes the chart of accounts and demo orders/trips with accounting integration.

### Production
```bash
# Backend
cd backend && npx prisma migrate deploy && npm start   # → :4000

# Frontend (separate host/process)
cd frontend && npm run build && npm start              # → :3000
```

---

## 9. Testing

Tests live with the backend (they cover the domain services):
```bash
cd backend
npm test                 # unit tests (RBAC, double-entry balancing, trip P&L, dispatch conflict, validation, error mapping)
npm run test:integration # integration tests (requires DATABASE_URL + migrate deploy)
npm run typecheck        # type check

cd ../frontend
npm run typecheck        # type check
npm run build            # production build check
```

---

## 10. Security

| Area | Implementation |
|------|----------------|
| RBAC | Role→permission map (`backend/src/lib/rbac.ts`, authoritative; mirrored in `frontend/lib/rbac.ts` for nav/route guards) enforced in two layers: frontend `middleware` (routes) + backend `requireAuth`+`requirePermission` (every API call) |
| API auth | Stateless JWT bearer tokens issued by `POST /api/auth/login`; the web app's NextAuth session carries the token and forwards it on SSR (`serverApi`) and client (`apiFetch`) requests |
| Separation of duties | Accounting posting (FINANCE) separated from operations editing (DISPATCHER) |
| Authentication | bcrypt(12) hashing, JWT sessions; drivers can only see their own jobs (enforced at the query layer) |
| Input validation | Shared Zod schemas across all APIs and forms |
| Accounting integrity | Entries must balance, posted entries are immutable (reverse via contra-entry), amounts kept precise with `Decimal` |
| SQL injection | Prisma parameterized queries only; no raw SQL |
| XSS | React auto-escaping + strict `Content-Type` |
| CSRF | NextAuth CSRF token, Same-Site cookies |
| Rate limiting | `lib/rate-limit.ts` (login, password reset, create operations) |
| Security headers | `next.config.mjs` (X-Frame-Options, nosniff, Referrer-Policy, etc.) |
| Audit log | All write operations recorded in `ActivityLog` |
| Uploads | MIME/size validation, randomized file names |

---

## 11. Related Documentation

- [docs/DATABASE.md](docs/DATABASE.md) — Database design (table definitions, relations)
- [docs/API.md](docs/API.md) — API design (endpoint specifications)
