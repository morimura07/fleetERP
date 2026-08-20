# API Design

RESTful, JSON throughout. **265 endpoints across 53 routers**, all mounted under `/api`
by `backend/src/main.ts`.

The API is a standalone Hono service that owns all database access. The web app holds
no Prisma dependency and calls it over HTTP with a JWT bearer token.

## Conventions

### Authentication

Stateless JWT bearer tokens issued by `POST /api/auth/login` and signed with `jose`.
Every request carries `Authorization: Bearer <token>`. The web app's NextAuth session
holds the token and forwards it on both server-side (`serverApi()`) and client
(`apiFetch()`) requests.

The token carries `role`, `roleKey`, `dataAreaId` and `organizationId`, which is what
lets authorization and tenancy resolve without a database round-trip per request.

### Authorization

Two independent checks on every call:

1. `requireAuth` — a valid, unexpired token
2. `requirePermission("resource:action")` — the caller's effective role grants it

Grants are read from an in-memory map hydrated from the `rbac_*` tables, so an admin
editing a role takes effect without a restart.

### Tenancy

Reach is resolved by `backend/src/lib/scope.ts` and applied as a `where` fragment on
every query:

| Role | Reach |
|------|-------|
| SUPER_ADMIN | every organization |
| ADMIN | every company inside their own organization |
| everyone else | their own company only |

A cross-entity caller may focus on one company with the `X-Data-Area` header. The header
is caller-supplied and can never widen reach beyond the caller's own organization.
**Reads outside the caller's reach return 404, not 403**, so the existence of another
tenant is never revealed.

### Response shapes

```jsonc
// List (paginated)
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
// Single
{ "data": { ... } }
// Error
{ "error": "message", "details": { "field": ["..."] } }
```

Monetary fields are **decimal strings** (`"5000.00"`), never floats, so precision
survives the wire.

### Common list query params

| Param | Description |
|-------|-------------|
| `page` | Page number (default 1) |
| `pageSize` | Items per page (1–100, default 20) |
| `q` | Search keyword (partial match on each model's searchable columns) |
| `sort` / `order` | Sort column (allow-listed) / `asc` \| `desc` |
| `status`, `clientId`, … | Model-specific filters |

### Optimistic concurrency

`PATCH` on a versioned model requires the `version` the client last read. A mismatch
returns **409** rather than silently overwriting someone else's edit.

### Error statuses

| Status | Condition |
|--------|-----------|
| 401 | Unauthenticated or expired token |
| 403 | Insufficient permission; expired demo environment; driver acting on another's job |
| 404 | Not found, **or outside the caller's tenant** |
| 409 | Unique violation, dispatch/scheduling conflict, stale `version`, invalid state transition |
| 413 / 415 | Upload size / format |
| 422 | Zod validation failed, or a business rule refused (unbalanced entry, closed period) |
| 429 | Rate limit exceeded (login, password reset, create operations) |
| 500 | Server error |

Validation is shared: `backend/src/lib/validations.ts` is mirrored in
`frontend/lib/validations.ts`, so a form and its endpoint reject the same input.

---

## Endpoints

Permission column shows the key required by `requirePermission()`. An em-dash means the
route is authenticated but not permission-gated — self-scoped routes such as the driver
portal and a user's own notifications.

### Auth & session

| Method | Path | Permission |
|--------|------|------------|
| POST | `/api/auth/login` | — |
| GET | `/api/auth/me` | — |
| POST | `/api/auth/forgot-password` | — |
| POST | `/api/auth/reset-password` | — |
| GET | `/api/notifications` | — |
| PATCH | `/api/notifications` | — |
| POST | `/api/uploads` | — |
| GET | `/api/lookups/clients` | `client:read` |
| GET | `/api/lookups/accounts` | `account:read` |
| GET | `/api/lookups/vendors` | `payable:read` |
| GET | `/api/lookups/procurement-form` | `procurement:read` |
| GET | `/api/lookups/warehouse-form` | `warehouse:read` |
| GET | `/api/lookups/companies` | `user:manage` |
| GET | `/api/lookups/expense-form` | `expense:read` |
| GET | `/api/lookups/customers` | `receivable:read` |
| GET | `/api/lookups/trip-form` | `trip:read` |
| GET | `/api/lookups/vehicle-form` | `vehicle:read` |
| GET | `/api/lookups/asset-form` | `asset:read` |
| GET | `/api/lookups/units` | `inventory:read` |
| GET | `/api/lookups/hr-form` | `hr:read` |
| GET | `/api/lookups/attendance-form` | `attendance:read` |
| GET | `/api/lookups/service-form` | `service:read` |
| GET | `/api/lookups/kpi-form` | `kpi:read` |
| GET | `/api/lookups/sales-form` | `sales:read` |
| GET | `/api/lookups/project-form` | `project:read` |
| GET | `/api/lookups/pos-form` | `pos:read` |
| GET | `/api/lookups/undispatched` | `dispatch:read` |

### Tenancy & administration

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/organizations` | `organization:manage` |
| POST | `/api/organizations` | `organization:manage` |
| PATCH | `/api/organizations/:id` | `organization:manage` |
| GET | `/api/companies` | `company:manage` |
| POST | `/api/companies` | `company:manage` |
| PATCH | `/api/companies/:id` | `company:manage` |
| GET | `/api/sandbox` | `company:manage` |
| POST | `/api/sandbox/provision` | `company:manage` |
| POST | `/api/sandbox/reset` | `company:manage` |
| POST | `/api/sandbox/credentials` | `company:manage` |
| PATCH | `/api/sandbox/expiry` | `company:manage` |
| GET | `/api/users` | `user:manage` |
| POST | `/api/users` | `user:manage` |
| GET | `/api/rbac/permissions` | `user:manage` |
| GET | `/api/rbac/roles` | `user:manage` |
| POST | `/api/rbac/roles` | `user:manage` |
| PATCH | `/api/rbac/roles/:key` | `user:manage` |
| PUT | `/api/rbac/roles/:key/permissions` | `user:manage` |
| DELETE | `/api/rbac/roles/:key` | `user:manage` |
| POST | `/api/rbac/users/:id/role` | `user:manage` |
| GET | `/api/activity` | `activity:read` |

### Freight operations

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/orders` | `order:read` |
| POST | `/api/orders` | `order:write` |
| GET | `/api/trips` | `trip:read` |
| POST | `/api/trips` | `trip:write` |
| POST | `/api/trips/batch` | `trip:write` |
| GET | `/api/trips/:id` | `trip:read` |
| PATCH | `/api/trips/:id` | `trip:write` |
| POST | `/api/trips/:id` | `trip:write` |
| GET | `/api/trips/:id/expenses` | `trip:read` |
| POST | `/api/trips/:id/expenses` | — |
| GET | `/api/dispatch` | `dispatch:read` |
| POST | `/api/dispatch` | `dispatch:write` |
| GET | `/api/dispatch/available` | `dispatch:write` |
| PATCH | `/api/dispatch/:id` | `dispatch:write` |
| DELETE | `/api/dispatch/:id` | `dispatch:write` |
| GET | `/api/jobs` | `job:read` |
| POST | `/api/jobs` | `job:write` |
| GET | `/api/jobs/:id` | `job:read` |
| PATCH | `/api/jobs/:id` | `job:write` |
| DELETE | `/api/jobs/:id` | `job:write` |
| GET | `/api/projects` | `project:read` |
| POST | `/api/projects` | `project:write` |
| GET | `/api/projects/:id` | `project:read` |
| POST | `/api/projects/:id/status` | `project:write` |
| POST | `/api/projects/:id/orders` | `project:write` |
| GET | `/api/tracking` | `tracking:read` |
| GET | `/api/waypoints` | `waypoint:read` |
| POST | `/api/waypoints` | `waypoint:write` |
| GET | `/api/reports` | — |
| POST | `/api/reports` | `report:write` |
| GET | `/api/driver/dispatches` | — |
| GET | `/api/driver/jobs/:id` | — |

### Fleet

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/vehicles` | `vehicle:read` |
| POST | `/api/vehicles` | `vehicle:write` |
| GET | `/api/vehicles/:id` | `vehicle:read` |
| PATCH | `/api/vehicles/:id` | `vehicle:write` |
| DELETE | `/api/vehicles/:id` | `vehicle:write` |
| GET | `/api/vehicles/:id/maintenances` | `vehicle:read` |
| POST | `/api/vehicles/:id/maintenances` | `vehicle:write` |
| GET | `/api/drivers` | `driver:read` |
| POST | `/api/drivers` | `driver:write` |
| GET | `/api/drivers/:id` | `driver:read` |
| PATCH | `/api/drivers/:id` | `driver:write` |
| DELETE | `/api/drivers/:id` | `driver:write` |
| GET | `/api/drivers/:id/availability` | `driver:read` |
| POST | `/api/drivers/:id/availability` | `driver:write` |
| GET | `/api/drivers/:id/holidays` | `driver:read` |
| POST | `/api/drivers/:id/holidays` | `driver:write` |
| DELETE | `/api/drivers/:id/holidays` | `driver:write` |
| GET | `/api/drivers/:id/documents` | `driver:read` |
| POST | `/api/drivers/:id/documents` | `driver:write` |
| DELETE | `/api/drivers/:id/documents` | `driver:write` |
| GET | `/api/service-orders` | `service:read` |
| POST | `/api/service-orders` | `service:write` |
| GET | `/api/service-orders/:id` | `service:read` |
| POST | `/api/service-orders/:id/parts` | `service:write` |
| POST | `/api/service-orders/:id/labor` | `service:write` |
| DELETE | `/api/service-orders/:id/labor/:laborId` | `service:write` |
| POST | `/api/service-orders/:id/complete` | `service:write` |
| POST | `/api/service-orders/:id/post` | `service:approve` |
| POST | `/api/service-orders/:id/cancel` | `service:approve` |
| GET | `/api/compliance` | `compliance:read` |
| GET | `/api/fuel` | `compliance:read` |

### Accounting & finance

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/accounts` | `account:read` |
| POST | `/api/accounts` | `account:write` |
| GET | `/api/ledger` | `ledger:read` |
| POST | `/api/ledger` | — |
| GET | `/api/ledger/:id` | `ledger:read` |
| POST | `/api/ledger/:id` | `ledger:post` |
| GET | `/api/fiscal-periods` | `period:read` |
| POST | `/api/fiscal-periods` | `period:manage` |
| GET | `/api/bank` | `bank:read` |
| POST | `/api/bank` | `bank:write` |
| GET | `/api/bank/transfers` | `bank:read` |
| POST | `/api/bank/transfers` | — |
| POST | `/api/bank/transfers/:id` | `bank:disburse` |
| GET | `/api/payments` | `payment:read` |
| POST | `/api/payments` | `payment:write` |
| GET | `/api/budgets` | `budget:read` |
| POST | `/api/budgets` | `budget:write` |
| GET | `/api/tax` | `tax:read` |
| GET | `/api/fx` | `fx:read` |
| POST | `/api/fx` | `fx:write` |
| POST | `/api/fx/revalue` | — |
| GET | `/api/consolidation` | `consolidation:read` |
| POST | `/api/consolidation` | `consolidation:run` |
| GET | `/api/assets` | `asset:read` |
| POST | `/api/assets` | `asset:write` |
| GET | `/api/assets/:id/custody` | `asset:read` |
| POST | `/api/assets/:id/assign` | `asset:write` |
| POST | `/api/assets/:id/return` | `asset:write` |
| GET | `/api/assets/:id` | `asset:read` |
| POST | `/api/assets/depreciation/run` | `asset:approve` |
| POST | `/api/assets/:id/dispose` | `asset:approve` |
| GET | `/api/expenses` | `expense:read` |
| POST | `/api/expenses` | `expense:write` |
| GET | `/api/expenses/:id` | `expense:read` |
| POST | `/api/expenses/:id/submit` | `expense:write` |
| POST | `/api/expenses/:id/review` | `expense:approve` |
| POST | `/api/expenses/:id/post` | `expense:approve` |

### Receivables & payables

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/customers` | `customer:read` |
| POST | `/api/customers` | `customer:write` |
| GET | `/api/receivables` | `receivable:read` |
| POST | `/api/receivables` | — |
| GET | `/api/receivables/:id` | `receivable:read` |
| POST | `/api/receivables/:id` | `receivable:post` |
| GET | `/api/collections` | `collection:read` |
| GET | `/api/collections/invoices` | `collection:read` |
| GET | `/api/collections/customers/:id/exposure` | `collection:read` |
| GET | `/api/collections/customers/:id/activity` | `collection:read` |
| POST | `/api/collections/dunning` | `collection:write` |
| POST | `/api/collections/dispute` | `collection:write` |
| POST | `/api/collections/promise` | `collection:write` |
| POST | `/api/collections/contact` | `collection:write` |
| POST | `/api/collections/write-off` | `collection:approve` |
| GET | `/api/vendors` | `vendor:read` |
| POST | `/api/vendors` | `vendor:write` |
| GET | `/api/payables` | `payable:read` |
| POST | `/api/payables` | — |
| GET | `/api/payables/:id` | `payable:read` |
| POST | `/api/payables/:id` | `payable:post` |

### Inventory & supply chain

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/inventory` | `inventory:read` |
| GET | `/api/inventory/valuation` | `inventory:read` |
| GET | `/api/inventory/cost-variance` | `inventory:read` |
| POST | `/api/inventory` | `inventory:write` |
| GET | `/api/inventory/:id` | `inventory:read` |
| PATCH | `/api/inventory/:id` | `inventory:write` |
| POST | `/api/inventory/:id/movements` | `inventory:write` |
| GET | `/api/inventory/:id/attributes` | `inventory:read` |
| PUT | `/api/inventory/:id/attributes` | `inventory:write` |
| GET | `/api/warehouses` | `warehouse:read` |
| POST | `/api/warehouses` | `warehouse:write` |
| PATCH | `/api/warehouses/:id` | `warehouse:write` |
| GET | `/api/warehouses/:id/balances` | `warehouse:read` |
| POST | `/api/warehouses/transfer` | `warehouse:write` |
| GET | `/api/procurement` | `procurement:read` |
| POST | `/api/procurement` | `procurement:write` |
| GET | `/api/procurement/:id` | `procurement:read` |
| POST | `/api/procurement/:id/approve` | `procurement:approve` |
| POST | `/api/procurement/:id/receive` | `procurement:write` |
| POST | `/api/procurement/:id/match` | `procurement:approve` |
| GET | `/api/product-attributes` | `inventory:read` |
| POST | `/api/product-attributes` | `inventory:write` |
| DELETE | `/api/product-attributes/:id` | `inventory:write` |
| GET | `/api/units` | `inventory:read` |
| POST | `/api/units/convert` | `inventory:read` |
| POST | `/api/units` | `inventory:write` |
| DELETE | `/api/units/:id` | `inventory:write` |

### Human capital

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/hr/employees` | `hr:read` |
| GET | `/api/hr/employees/:id` | `hr:read` |
| GET | `/api/hr/documents/expiring` | `hr:read` |
| POST | `/api/hr/contracts` | `hr:write` |
| POST | `/api/hr/contracts/:id/activate` | `hr:approve` |
| POST | `/api/hr/contracts/:id/end` | `hr:approve` |
| GET | `/api/hr/leave` | `hr:read` |
| POST | `/api/hr/leave` | `hr:write` |
| POST | `/api/hr/leave/:id/review` | `hr:approve` |
| POST | `/api/hr/leave/:id/cancel` | `hr:write` |
| POST | `/api/hr/employees/:id/entitlement` | `hr:write` |
| POST | `/api/hr/employees/:id/documents` | `hr:write` |
| GET | `/api/attendance/entries` | `attendance:read` |
| POST | `/api/attendance/entries` | `attendance:write` |
| POST | `/api/attendance/entries/:id/clock-out` | `attendance:write` |
| DELETE | `/api/attendance/entries/:id` | `attendance:write` |
| GET | `/api/attendance/timesheets` | `attendance:read` |
| GET | `/api/attendance/timesheets/:id` | `attendance:read` |
| POST | `/api/attendance/timesheets/build` | `attendance:write` |
| POST | `/api/attendance/timesheets/:id/submit` | `attendance:write` |
| POST | `/api/attendance/timesheets/:id/review` | `attendance:approve` |
| GET | `/api/payroll/employees` | `payroll:read` |
| POST | `/api/payroll/employees` | `payroll:write` |
| PATCH | `/api/payroll/employees/:id` | `payroll:write` |
| GET | `/api/payroll/runs` | `payroll:read` |
| GET | `/api/payroll/runs/:id` | `payroll:read` |
| POST | `/api/payroll/runs` | `payroll:write` |
| POST | `/api/payroll/runs/:id/approve` | `payroll:approve` |
| POST | `/api/payroll/runs/:id/post` | `payroll:approve` |

### Commercial & planning

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/sales/leads` | `sales:read` |
| POST | `/api/sales/leads` | `sales:write` |
| POST | `/api/sales/leads/:id/stage` | `sales:write` |
| GET | `/api/sales/quotes` | `sales:read` |
| GET | `/api/sales/quotes/:id` | `sales:read` |
| POST | `/api/sales/quotes` | `sales:write` |
| POST | `/api/sales/quotes/:id/status` | `sales:write` |
| POST | `/api/sales/quotes/:id/convert` | `sales:convert` |
| GET | `/api/pos` | `pos:read` |
| GET | `/api/pos/:id` | `pos:read` |
| POST | `/api/pos` | `pos:write` |
| POST | `/api/pos/:id/complete` | `pos:write` |
| POST | `/api/pos/:id/void` | `pos:write` |
| GET | `/api/planning/forecasts` | `planning:read` |
| POST | `/api/planning/forecasts` | `planning:write` |
| PATCH | `/api/planning/forecasts/:id` | `planning:write` |
| POST | `/api/planning/forecasts/:id/status` | `planning:write` |
| GET | `/api/planning/capacity` | `planning:read` |
| GET | `/api/planning/actuals` | `planning:read` |
| GET | `/api/planning/periods` | `planning:read` |
| GET | `/api/clients` | `client:read` |
| POST | `/api/clients` | `client:write` |
| GET | `/api/clients/:id` | `client:read` |
| PATCH | `/api/clients/:id` | `client:write` |
| DELETE | `/api/clients/:id` | `client:write` |

### Analytics & exports

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/dashboard/stats` | `dashboard:view` |
| GET | `/api/dashboard/executive` | `dashboard:view` |
| GET | `/api/dashboard/kpi` | `dashboard:view` |
| GET | `/api/dashboard/corridor-profitability` | `dashboard:view` |
| GET | `/api/operational-kpi/dock-events` | `kpi:read` |
| POST | `/api/operational-kpi/dock-events` | `kpi:write` |
| GET | `/api/operational-kpi/damage-reports` | `kpi:read` |
| POST | `/api/operational-kpi/damage-reports` | `kpi:write` |
| POST | `/api/operational-kpi/damage-reports/:id/status` | `kpi:write` |
| GET | `/api/operational-kpi/feedback` | `kpi:read` |
| POST | `/api/operational-kpi/feedback` | `kpi:write` |
| GET | `/api/exports/dispatch-pdf` | `export:run` |
| GET | `/api/exports/jobs-csv` | `export:run` |
| GET | `/api/exports/payment-pdf` | `export:run` |
| GET | `/api/exports/report-pdf/:id` | `report:read` |