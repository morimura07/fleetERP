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

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (PC / Tablet / SP)                  │
│   shadcn/ui + React Hook Form + Zod (client-side validation)   │
└───────────────┬──────────────────────────────┬────────────────┘
                │ App Router (Server Components) │ fetch /api/*
                ▼                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    Next.js 15 (App Router)                     │
│                                                                │
│  middleware.ts ── auth check + RBAC route guard                │
│                                                                │
│  Route Handlers (/api/*)        Server Components (pages)      │
│   ├─ requirePermission()         ├─ session via auth()         │
│   ├─ Zod input validation        └─ direct Prisma reads        │
│   ├─ services/ domain logic                                    │
│   ├─ activity log / notifications                              │
│   └─ api.ts unified error handling                             │
│                                                                │
│  lib/services/  ledger | freight | dispatch | payment |        │
│                 dashboard | pdf | csv                          │
└───────────────┬──────────────────────────────┬────────────────┘
                │ Prisma ORM                     │ nodemailer
                ▼                                ▼
        ┌──────────────┐                  ┌──────────────┐
        │  PostgreSQL  │                  │   SMTP       │
        └──────────────┘                  └──────────────┘
```

**Layer responsibilities**

| Layer | Responsibility |
|-------|----------------|
| **middleware** | Redirect unauthenticated users, role-based route guards (`ROUTE_GUARDS`), isolate drivers to `/driver` |
| **Route Handlers** | REST API. Per-call authorization via `requirePermission()`, Zod validation, pagination/search/sort, exceptions → HTTP via `handleError()` |
| **services/** | Framework-independent domain logic (double-entry balancing, trip P&L, dispatch conflict checks). Unit-tested |
| **Server Components** | List/detail initial render reads Prisma directly; the client uses `fetch` for follow-up actions |

---

## 3. Tech Stack

| Area | Technology |
|------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod |
| Backend | Next.js Route Handlers, Server Components, Prisma ORM |
| Database | PostgreSQL (works with managed Postgres such as Neon) |
| Auth | NextAuth (Auth.js v5), Credentials Provider, JWT sessions, RBAC |
| Accounting | In-house double-entry engine (`Decimal`-based, multi-currency) |
| Documents | PDFKit (PDF), PapaParse (CSV) |
| Email | nodemailer (password reset) |
| Testing | Vitest (unit & integration) |
| UI/UX | Dark-first theme (light toggle), custom loading indicator |
| Deployment | Node.js (`next build` / `next start`) |

---

## 4. Data Model

The Prisma schema (`prisma/schema.prisma`) defines **31 models**, grouped by domain:

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

```
fleetflow/
├─ prisma/
│  ├─ schema.prisma          # 31 model definitions
│  ├─ migrations/            # init / orders_trips / finance_role / accounting_ledger / ap_ar / core_finance
│  └─ seed.ts                # seed data (users per role, chart of accounts, demo orders/trips/AP-AR/finance)
├─ src/
│  ├─ middleware.ts          # auth + RBAC route guard
│  ├─ auth.ts / auth.config.ts  # NextAuth config (Node / Edge split)
│  ├─ app/
│  │  ├─ (auth)/             # login / forgot-password / reset-password
│  │  ├─ (admin)/            # admin console (each screen has a loading.tsx skeleton)
│  │  ├─ (driver)/driver/    # driver portal
│  │  ├─ api/                # REST Route Handlers
│  │  └─ forbidden/          # 403
│  ├─ components/
│  │  ├─ ui/                 # shadcn/ui primitives + loader.tsx (custom loader)
│  │  ├─ layout/             # sidebar / topbar / theme-toggle / page-header
│  │  └─ data/               # data-table.tsx (generic table), empty-state, split-gauge
│  ├─ lib/
│  │  ├─ prisma.ts  rbac.ts  auth-guard.ts  validations.ts
│  │  ├─ api.ts  activity.ts  notifications.ts  rate-limit.ts
│  │  ├─ mail.ts  password.ts  fetcher.ts  labels.ts  utils.ts
│  │  └─ services/  ledger.ts  freight.ts  ap-ar.ts  dispatch.ts  payment.ts  tax.ts
│  │                collections.ts  budget.ts  cash-bank.ts  fx.ts  consolidation.ts
│  │                dashboard.ts  pdf.ts  csv.ts
│  └─ types/next-auth.d.ts
├─ tests/
│  ├─ unit/                  # rbac, ledger, freight, ap-ar, budget, fx, dispatch, payment, validations, api-error
│  └─ integration/           # dispatch-conflict test (requires DB)
└─ docs/                     # DATABASE.md, API.md, PRD-STATUS.md (this README also serves as ARCHITECTURE)
```

---

## 8. Setup

### Prerequisites
- Node.js 20+
- PostgreSQL (local, or managed such as Neon)

### Steps
```bash
# 1. Install dependencies
npm install

# 2. Environment variables
cp .env.example .env
#   Generate AUTH_SECRET: openssl rand -base64 32
#   Edit DATABASE_URL to point at your Postgres

# 3. Apply migrations + generate the client
npx prisma migrate deploy
npx prisma generate

# 4. Seed initial data
npm run prisma:seed

# 5. Start the dev server
npm run dev
# → http://localhost:3000
```

### Seeded logins
| Role | Email | Password |
|------|-------|----------|
| ADMIN | admin@fleetflow.local | admin1234 |
| DISPATCHER | dispatcher@fleetflow.local | dispatch1234 |
| FINANCE | finance@fleetflow.local | finance1234 |
| DRIVER | driver@fleetflow.local | driver1234 |
| STAFF | staff@fleetflow.local | staff1234 |

> The seed includes the chart of accounts (32 accounts) and demo orders/trips with accounting integration.

### Production
```bash
npx prisma migrate deploy   # apply schema to the production DB
npm run build               # prisma generate + next build
npm start                   # http://localhost:3000
```

---

## 9. Testing

```bash
npm test                 # unit tests (RBAC, double-entry balancing, trip P&L, dispatch conflict, validation, error mapping)
npm run test:integration # integration tests (requires DATABASE_URL + migrate deploy)
npm run typecheck        # type check
npm run build            # production build check
```

---

## 10. Security

| Area | Implementation |
|------|----------------|
| RBAC | Role→permission map in `lib/rbac.ts` + `middleware` (routes) + `requirePermission` (API), enforced in two layers |
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
