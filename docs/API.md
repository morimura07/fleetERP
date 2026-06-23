# API Design

RESTful, JSON throughout. Authentication is the NextAuth session cookie. Authorization is enforced per handler via `requirePermission()`.

## Conventions

### Response shapes
```jsonc
// List (paginated)
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
// Single
{ "data": { ... } }
// Error
{ "error": "message", "details": { "field": ["..."] } }
```

### Common list query params
| Param | Description |
|-------|-------------|
| `page` | Page number (default 1) |
| `pageSize` | Items per page (1–100, default 20) |
| `q` | Search keyword (partial match on each model's searchable columns) |
| `sort` / `order` | Sort column (allow-listed) / `asc` \| `desc` |
| `status`, `clientId`, … | Model-specific filters |

### Error statuses
| Status | Condition |
|--------|-----------|
| 401 | Unauthenticated |
| 403 | Insufficient permission / driver acting on another's job |
| 404 | Not found (Prisma P2025) |
| 409 | Unique-constraint violation / dispatch conflict / related records exist / invalid state transition |
| 413 / 415 | Upload size / format |
| 422 | Zod validation failed |
| 429 | Rate limit exceeded |
| 500 | Server error |

Monetary fields in request/response bodies are **decimal strings** (e.g. `"5000.00"`) to preserve precision.

---

## Endpoints

### Auth
| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| POST | `/api/auth/[...nextauth]` | — | NextAuth (login / session) |
| POST | `/api/auth/forgot-password` | public (5 req/min) | Send reset email (existence hidden) |
| POST | `/api/auth/reset-password` | public | Verify token + set new password |

### Accounting — Chart of Accounts
| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/accounts` | account:read |
| POST | `/api/accounts` | account:write |

### Accounting — Journal (double-entry)
| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/ledger` | ledger:read | Journal entries (filter `status`) |
| POST | `/api/ledger` | ledger:write / ledger:post | Create. `post:true` posts immediately (requires `ledger:post`); otherwise saves a draft. Rejects unbalanced lines (422) |
| GET | `/api/ledger/{id}` | ledger:read | Entry with lines |
| POST | `/api/ledger/{id}` | ledger:post | `{ action: "post" \| "reverse" }` — post a draft, or reverse a posted entry via contra-entry |

**Balancing rule:** `SUM(debit) == SUM(credit)`, each line one non-zero side, ≥ 2 lines, amounts ≥ 0. Posted entries are immutable.

### Freight — Orders
| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/orders` | order:read | Orders (filter `status`) |
| POST | `/api/orders` | order:write | Create order (auto `orderCode`) |
| GET | `/api/orders/{id}` | order:read | Order detail + client/trip/invoice |
| PATCH | `/api/orders/{id}` | order:write | Update |
| POST | `/api/orders/{id}` | order:invoice | `{ action: "invoice" }` — posts AR invoice to the ledger, sets order INVOICED. Idempotent (409 if already invoiced) |

### Freight — Trips
| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/trips` | trip:read | Trips (filter `status`) |
| POST | `/api/trips` | trip:write | Create; **conflict-checked** on driver/vehicle, sets order IN_TRANSIT, notifies driver |
| GET | `/api/trips/{id}` | trip:read | Trip detail incl. computed **P&L** |
| PATCH | `/api/trips/{id}` | trip:write | Update |
| GET | `/api/trips/{id}/expenses` | trip:read | List trip expenses |
| POST | `/api/trips/{id}/expenses` | trip:write / order:invoice | Add expense. `post:true` posts it to the ledger (requires `order:invoice`) |

### Drivers
| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/drivers` | driver:read / driver:write |
| GET/PATCH/DELETE | `/api/drivers/{id}` | driver:read / driver:write |
| GET/POST | `/api/drivers/{id}/availability` | driver:read / driver:write (upsert) |
| GET/POST/DELETE | `/api/drivers/{id}/holidays` | driver:read / driver:write |

### Vehicles
| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/vehicles` | vehicle:read / vehicle:write |
| GET/PATCH/DELETE | `/api/vehicles/{id}` | vehicle:read / vehicle:write |
| GET/POST | `/api/vehicles/{id}/maintenances` | vehicle:read / vehicle:write |

### Clients / Jobs
| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/clients` | client:read / client:write |
| GET/PATCH/DELETE | `/api/clients/{id}` | client:read / client:write |
| GET/POST | `/api/jobs` | job:read / job:write |
| GET/PATCH/DELETE | `/api/jobs/{id}` | job:read / job:write (status change notifies the assigned driver) |

### Dispatch (domestic)
| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/dispatch` | dispatch:read | Dispatch history |
| POST | `/api/dispatch` | dispatch:write | **Conflict-checked**, sets job ASSIGNED, notifies driver |
| GET | `/api/dispatch/available?start&end` | dispatch:write | Free drivers & vehicles for the window |
| PATCH/DELETE | `/api/dispatch/{id}` | dispatch:write | Update (conflict excludes self) / cancel |

**Conflict logic** (shared by dispatch & trips): over the half-open interval `[start, end)`, count non-cancelled records where `scheduledStart < end && start < scheduledEnd`, per driver and per vehicle. Any hit → 409.

### Reports / Notifications / Uploads
| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/reports` | report:read | DRIVER sees only their own |
| POST | `/api/reports` | report:write | Own jobs only; sets job COMPLETED + dispatch DONE, notifies reviewers |
| GET/PATCH | `/api/notifications` | authenticated | Get own / mark read |
| POST | `/api/uploads` | report:write | Proof image (JPEG/PNG/WebP, ≤ 8 MB) |

### Payments / Activity / Users
| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/payments?year&month` | payment:read | Monthly aggregate (computed live) |
| POST | `/api/payments?year&month` | payment:write | Finalize aggregate into Payment |
| GET | `/api/activity` | activity:read | Audit log |
| GET/POST | `/api/users` | user:manage | List / create users |

### Exports
| Method | Path | Format | Content |
|--------|------|--------|---------|
| GET | `/api/exports/jobs-csv?status=` | CSV | Jobs list |
| GET | `/api/exports/dispatch-pdf?date=YYYY-MM-DD` | PDF | Dispatch sheet |
| GET | `/api/exports/report-pdf/{id}` | PDF | Daily report |
| GET | `/api/exports/payment-pdf?year&month` | PDF | Monthly payments |

All exports require `export:run` and are recorded in `ActivityLog` as EXPORT.

---

## Authorization matrix

`read` permissions are granted broadly (down to STAFF); writes are restricted by role. The two write-authority domains — **accounting** (FINANCE) and **operations** (DISPATCHER) — are deliberately separated.

| Permission | ADMIN | DISPATCHER | FINANCE | DRIVER | STAFF |
|------------|:-:|:-:|:-:|:-:|:-:|
| dashboard:view | ✓ | ✓ | ✓ | | ✓ |
| order:read / trip:read | ✓ | ✓ | ✓ | | ✓ |
| order:write / trip:write | ✓ | ✓ | | | |
| order:invoice | ✓ | | ✓ | | |
| account:read / ledger:read | ✓ | ✓ | ✓ | | ✓ |
| account:write | ✓ | | ✓ | | |
| ledger:write / ledger:post | ✓ | | ✓ | | |
| job:write / dispatch:write | ✓ | ✓ | | | |
| client:write | ✓ | ✓ | | | |
| driver:write / vehicle:write | ✓ | | | | |
| report:write | ✓ | | | ✓ | |
| report:review | ✓ | ✓ | | | |
| payment:read | ✓ | ✓ | ✓ | | ✓ |
| payment:write | ✓ | | ✓ | | |
| export:run | ✓ | ✓ | ✓ | | |
| activity:read | ✓ | | ✓ | | |
| user:manage | ✓ | | | | |

> The full role → permission map lives in `src/lib/rbac.ts`. Route-prefix guards (`ROUTE_GUARDS`) enforce page access in `middleware.ts`; `requirePermission()` enforces it per API handler.
