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

### Fleet & compliance
- **Vehicles & drivers** — Registry, maintenance history, workshop service orders, and a default driver per truck that pre-fills dispatch.
- **Expiry warnings** — Insurance, inspection, COMESA permit, Yellow Card, licence and passport, all surfaced 14 days ahead. A truck impounded at a border is the loss this prevents.
- **Fuel efficiency** — Actual km/L per vehicle against a target, which is how siphoning shows up.

### Inventory, procurement & assets
- **Stock** — Spare parts, tyres and fuel on moving-average cost, multi-warehouse balances and transfers, with ledger postings on issue.
- **Procurement** — Purchase orders through to goods receipt with 3-way matching and variance flags.
- **Fixed assets** — Register, straight-line depreciation runs, disposal with gain/loss, plus custody and warranty tracking.

### People & payroll
- **HR** — Employment contracts, leave with balance accounting, employee documents with expiry warnings.
- **Time & attendance** — Clock-in/out rolled into monthly timesheets; approved overtime feeds payroll.
- **Payroll** — Monthly pay runs with per-country statutory computation (PAYE bands, NSSF, SHIF) posted to the ledger.

### Commercial
- **Sales** — CRM leads and freight quotations; an accepted quote converts atomically into an order.
- **Projects** — Contracts grouping orders, tracked live against a planned budget.
- **Master planning** — Demand forecast per period and corridor, capacity against the live fleet, and **forecast vs actual** once the work has run.

### Management & analytics
- **KPI dashboard** — The client's five KPI categories plus plan-vs-actual, each tile linking to its underlying records.
- **Cost accounting** — Per-trip, per-corridor and per-project P&L; standard-vs-actual cost variance.
- **Audit log & notifications** — Every write is logged with a field-level before→after diff; drivers are notified of new dispatches.
- **Document exports** — Dispatch sheet, daily report and monthly payment PDFs, plus jobs CSV.

### Multi-tenancy
- **Organizations** — Separate customers on one database, each with their own administrators and their own companies, invisible to each other.
- **Companies** — Legal entities inside an organization, with every business record partitioned by `dataAreaId` and a company switcher for cross-entity users.
- **Demo sandbox** — Throwaway partitions with their own sign-in details and an expiry date, resettable without touching real data.

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

The Prisma schema (`backend/prisma/schema.prisma`) defines **79 models** and 69 enums
across 38 migrations, grouped by domain:

**Tenancy & auth**
- `Organization` (parent company — the tenant boundary) / `Company` (legal entity, its `code` is the `dataAreaId`)
- `User` (6 roles) / `RbacRole` / `RbacPermission` / `RbacRolePermission` (dynamic RBAC)
- `ActivityLog` (audit log) / `Notification`

**Accounting**
- `Account` (chart of accounts) / `JournalEntry` (voucher) / `JournalLine` / `FiscalPeriod` (period close)

**Freight**
- `Order` / `Trip` (many per order) / `TripExpense`

**Fleet & drivers**
- `Driver` / `DriverAvailability` / `Holiday` / `DriverDocument`
- `Vehicle` / `VehicleMaintenance` / `VehiclePosition` / `GpsWaypoint`

**Domestic delivery**
- `Client` / `DeliveryJob` / `Dispatch` / `DailyReport` / `Payment`

**AP / AR & collections (M1 / M2 / M7)**
- `Vendor` / `VendorInvoice` / `VendorPayment`
- `Customer` / `CustomerInvoice` / `CustomerReceipt` / `CollectionActivity`

**Core finance (M3 / M4 / M5 / M10, multi-currency)**
- `Budget` / `BudgetLine` / `BankAccount` / `MoneyTransfer` / `ConsolidationMap` / `ExchangeRate`

**Inventory & supply chain (M13–M18)**
- `StockItem` / `StockMovement` / `StockBalance` / `Warehouse` / `UnitOfMeasure`
- `ProductAttribute` / `StockItemAttribute`
- `PurchaseOrder` / `PurchaseOrderLine` / `GoodsReceipt` / `GoodsReceiptLine`

**Assets & workshop (M19–M22)**
- `FixedAsset` / `DepreciationEntry` / `AssetAssignment` (custody)
- `ServiceOrder` / `ServicePart` / `ServiceLabor`

**Human capital (M9 / M23 / M24 / M26)**
- `Employee` / `EmploymentContract` / `EmployeeDocument`
- `PayRun` / `Payslip` / `ExpenseClaim` / `ExpenseLine`
- `LeaveRequest` / `LeaveBalance` / `TimeEntry` / `Timesheet`

**Commercial (M27–M29 / M33)**
- `Lead` / `SalesQuote` / `SalesQuoteLine` / `Project` / `DemandForecast`
- `PosSale` / `PosSaleLine`

**Service quality (KPI capture)**
- `DockEvent` (turnaround) / `DamageReport` / `CustomerFeedback` (CSAT / NPS)

> See [docs/DATABASE.md](docs/DATABASE.md) for table definitions and relations, and
> [docs/PRD-STATUS.md](docs/PRD-STATUS.md) for the 36-module PRD coverage map.

---

## 5. Access Control

Two independent mechanisms: **who you are** (RBAC) and **what you can reach** (tenancy).

### 5.1 Roles & permissions (RBAC)

97 permission keys across 6 system roles. Grants live in the `rbac_*` tables so an
admin can create custom roles and re-map permissions from the Roles screen; they
hydrate into an in-memory map at startup so `can()` stays synchronous. The built-in
roles are seeded with `isSystem` and cannot be deleted, but their grants are editable.

Enforced in two layers: frontend `middleware` (per route) and
`requireAuth` + `requirePermission()` (per API call).

| Role | Function | Main permissions |
|------|----------|------------------|
| **SUPER_ADMIN** | Platform operator | Everything, and the only role that creates organizations or reads across them |
| **ADMIN** | Organization administrator | Everything inside their own organization |
| **DISPATCHER** | Operations Planner | Create/edit orders, trips, dispatch, jobs; accounting is read-only |
| **FINANCE** | Finance Controller | Post/reverse journal entries, maintain accounts, invoice orders, finalize payments; operations are read-only; no user management |
| **DRIVER** | Driver | View own jobs and file daily reports (isolated to the driver portal) |
| **STAFF** | General staff | Read access to core data |

> **Separation of duties**: accounting authority (FINANCE) and operations editing
> (DISPATCHER) are kept separate. Invoicing and journal posting require finance permissions.

### 5.2 Tenancy & data isolation

Two levels above the data, both resolved in `backend/src/lib/scope.ts` — the single
place the rule is expressed, so every query enforces it identically:

```
Organization   the tenant boundary (parent company). Separate customers.
  └─ Company   a legal entity, carried on every business record as `dataAreaId`
```

| Role | Reach |
|------|-------|
| SUPER_ADMIN | every organization |
| ADMIN | every company inside **their own** organization |
| everyone else | their own company only |

The company → organization map is held in memory (`lib/organization.ts`, hydrated at
startup) so `areaScope()` can stay synchronous. It **fails closed**: if hydration fails,
an ADMIN drops to seeing only their own entity — narrower than intended, never wider.
The `X-Data-Area` company-switcher header is caller-supplied and can never widen reach
beyond the caller's own organization. Cross-tenant reads return **404, not 403**, so the
existence of another tenant is never revealed.

---

## 6. Screens

### Auth
| Path | Screen |
|------|--------|
| `/login` | Sign in |
| `/forgot-password` | Request password reset |
| `/reset-password` | Set new password |
| `/forbidden` | 403 (access denied) |

### Admin console `(admin)` — 53 screens

Grouped as they appear in the sidebar. Each entry lists the permission that gates
it; a nav group disappears entirely when the role holds none of its permissions.

**Overview**

| Path | Screen | Permission |
|------|--------|------------|
| `/dashboard` | KPI dashboard, financial gauges, document expiry, plan vs actual | `dashboard:view` |

**Operations**

| Path | Screen | Permission |
|------|--------|------------|
| `/orders` | Orders (CRUD, invoicing) | `order:read` |
| `/trips` | Trips — assign many vehicles per order, expenses, trip P&L | `trip:read` |
| `/dispatch` | Dispatch (free driver/vehicle lookup, conflict check, PDF) | `dispatch:read` |
| `/jobs` | Delivery jobs (search, status filter, CSV) | `job:read` |
| `/projects` | Projects / contracts with budget-vs-actual P&L (M29) | `project:read` |
| `/waypoints` | GPS waypoint registry (M30) | `waypoint:read` |
| `/reports` | Daily report review (PDF export) | `report:read` |

**Service Quality** — the capture screens feeding the dashboard's KPIs

| Path | Screen | Permission |
|------|--------|------------|
| `/dock-events` | Arrival/departure → truck turnaround | `kpi:read` |
| `/damage-reports` | Damage & claim rate | `kpi:read` |
| `/feedback` | CSAT / NPS | `kpi:read` |

**Sales & Marketing**

| Path | Screen | Permission |
|------|--------|------------|
| `/leads` | CRM leads (M27) | `sales:read` |
| `/quotes` | Freight quotations, convert to order | `sales:read` |
| `/clients` | Client registry | `client:read` |
| `/pos` | Retail / POS counter sales (M28) | `pos:read` |

**Fleet**

| Path | Screen | Permission |
|------|--------|------------|
| `/vehicles` | Vehicle CRUD, maintenance history, default driver | `vehicle:read` |
| `/drivers` · `/drivers/[id]` | Driver CRUD, availability & holidays | `driver:read` |
| `/service` | Workshop service orders (M22) | `service:read` |
| `/compliance` | Document-expiry dashboard + fuel-efficiency monitor (M11) | `compliance:read` |

**Inventory & Supply Chain**

| Path | Screen | Permission |
|------|--------|------------|
| `/inventory` | Stock items, moving-average cost, movements (M14) | `inventory:read` |
| `/warehouses` | Multi-warehouse balances & transfers (M18) | `warehouse:read` |
| `/procurement` | Purchase orders, goods receipts, 3-way match (M15) | `procurement:read` |
| `/product-attributes` | Custom item specifications (M16) | `inventory:read` |
| `/units` | Units-of-measure registry & converter (M30) | `inventory:read` |
| `/cost-variance` | Standard vs moving-average cost (M13) | `inventory:read` |

**Human Resources**

| Path | Screen | Permission |
|------|--------|------------|
| `/hr` | Contracts, leave, employee documents (M24) | `hr:read` |
| `/attendance` | Clock-in/out, timesheets (M26) | `attendance:read` |
| `/payroll` | Pay runs with country statutory computation (M9) | `payroll:read` |

**Receivables & Payables**

| Path | Screen | Permission |
|------|--------|------------|
| `/customers` · `/receivables` | Customers & AR invoices (post, receipt) | `customer:read` · `receivable:read` |
| `/collections` | Aging buckets, dunning, disputes, write-off (M7) | `collection:read` |
| `/vendors` · `/payables` | Vendors & AP bills (post, pay) | `vendor:read` · `payable:read` |

**Finance**

| Path | Screen | Permission |
|------|--------|------------|
| `/accounts` | Chart of Accounts | `account:read` |
| `/ledger` | Journal (post / reverse) | `ledger:read` |
| `/periods` | Fiscal calendar & period close (M34) | `period:read` |
| `/bank` | Cash & bank accounts + driver disbursements (M4) | `bank:read` |
| `/payments` | Monthly payment aggregation, finalize, PDF | `payment:read` |
| `/expenses` | Trip cash sheets / expense claims (M23) | `expense:read` |
| `/budgets` | CapEx/OpEx budget control (M3) | `budget:read` |
| `/planning` | Demand forecast, capacity plan, forecast vs actual (M33) | `planning:read` |
| `/tax` | VAT/WHT return preparation (M10) | `tax:read` |
| `/fx` | Exchange rates + period-end revaluation | `fx:read` |
| `/consolidation` | Subsidiary→parent rollup (M5) | `consolidation:read` |
| `/assets` | Fixed assets, depreciation, custody & warranty (M19/M20) | `asset:read` |
| `/corridor-pnl` | Per-corridor profitability (M6) | `dashboard:view` |

**System**

| Path | Screen | Permission |
|------|--------|------------|
| `/organizations` | Parent-company registry — **SUPER_ADMIN only** | `organization:manage` |
| `/companies` | Legal entities inside the organization | `company:manage` |
| `/sandbox` | Demo partitions, demo logins, access window (M32) | `company:manage` |
| `/users` | User management | `user:manage` |
| `/roles` | Roles & permissions matrix (dynamic RBAC, M36) | `user:manage` |
| `/activity` | Audit log with field-level before→after diff (M31) | `activity:read` |

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
│  │  ├─ schema.prisma        # 79 models, 69 enums
│  │  ├─ migrations/          # init / orders_trips / finance_role / accounting_ledger / ap_ar / core_finance / operations
│  │  └─ seed.ts              # seed data (users per role, chart of accounts, demo data)
│  ├─ uploads/                # proof-of-delivery images (served at /uploads)
│  ├─ src/
│  │  ├─ main.ts              # Hono bootstrap — CORS, static, mounts all routes under /api
│  │  ├─ lib/                 # prisma  rbac  http (ok/created/onError)  auth (JWT + guards)
│  │  │                       # validations  activity  notifications  mail  password  rate-limit  format  errors
│  │  ├─ services/            # ledger  freight  ap-ar  dispatch  payment  tax  collections
│  │  │                       # budget  cash-bank  fx  consolidation  compliance  fuel  dashboard  pdf  csv
│  │  └─ routes/              # one file per domain (orders, trips, ledger, payables, … 53 routers)
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
| SUPER_ADMIN | root@fleetflow.local | root1234 |
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
npm test                 # 328 unit tests (tenancy isolation, double-entry balancing, trip P&L,
                         # dispatch conflicts, plan vs actual, statutory payroll, validation)
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
