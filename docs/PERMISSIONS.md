# FleetFlow ERP — Permissions & Access Levels

_How user access is configured, the function of every permission, and the exact grants for each level._

> **Source of truth:** `backend/src/lib/rbac.ts` (`ALL` + `DEFAULT_ROLE_PERMISSIONS`), mirrored for the web UI in `frontend/lib/rbac.ts`. This document describes the **seeded defaults**; an admin can re-tune any level at runtime in the **Roles & Permissions** screen without a code change. Companion: [PROJECT-DOCUMENTATION §5.2](PROJECT-DOCUMENTATION.md#52-dynamic-role-based-access-control-rbac).

**At a glance:** 96 permissions · 5 built-in levels (+ custom) · grants per level — Admin 96 · Finance 73 · Dispatcher 55 · Staff 36 · Driver 3.

## Contents

1. [How user permissions are configured](#1-how-user-permissions-are-configured)
2. [The five permission levels](#2-the-five-permission-levels)
3. [Level capability comparison](#3-level-capability-comparison)
4. [Function of each permission](#4-function-of-each-permission)
5. [Appendix — full grant matrix](#5-appendix--full-grant-matrix)

## 1. How user permissions are configured

Access is determined by a user's **role (their permission level)**, not by attaching permissions to individuals. Each `User` record carries:

| Field | Purpose |
|---|---|
| `role` | One of the **5 system levels** — `ADMIN`, `DISPATCHER`, `FINANCE`, `DRIVER`, `STAFF` (default `STAFF`) |
| `roleKey` | Optional **custom role** — when set, its grants **replace** the system-level defaults for permission checks |
| `dataAreaId` | The user's **home company** (legal-entity isolation) |
| `isActive` | Whether the account can sign in |

**Effective level:** `effectiveRoleKey = roleKey ?? role` — a user runs on their custom role if one is assigned, otherwise on their system level. Grants are **data-driven** (`rbac_*` tables hydrated into an in-memory map), so `can()` is synchronous and edits take effect without a redeploy.

**Enforced in two layers:** the frontend middleware guards page routes, and the backend re-checks `requirePermission(...)` on **every API call**. The JWT carries both `role` and `roleKey`.

**The base `role` still drives special behavior** even under a custom role: only `ADMIN` gets the cross-company switcher, and `DRIVER` is confined to the portal with its data scoped to its own jobs at the query layer.

**Where you set it:** *System ▸ Users* assigns a user's level, home company, and active state; *System ▸ Roles & Permissions* defines custom levels and their grants.

## 2. The five permission levels

Levels are organized by **function**, not a strict hierarchy — Finance and Dispatcher are peers over different domains. Admin sits above all; Staff and Driver are the limited tiers.

### 1. Administrator (`ADMIN`)

**System owner / IT.** Holds **all 96 permissions**. The only level that can manage users, define roles, and manage companies, and the only one that can switch the active company for a cross-entity view.

### 2. Finance Controller (`FINANCE`)

**Accounting authority.** Every posting & approval permission — post/reverse the ledger, post AP/AR, invoice orders, disburse to drivers, run FX revaluation & consolidation, close fiscal periods, and approve payroll, expenses, assets, HR and timesheets. **Read-only on operations** (view orders/trips, but no order/trip/dispatch editing). Sees the audit log. **Cannot** manage users or companies.

### 3. Dispatcher / Operations Planner (`DISPATCHER`)

**Operational authority.** Create & edit orders, trips, jobs, dispatch, clients, planning, sales (+convert), POS, projects, and inventory/warehouse/procurement entries; approve & post workshop service orders; record expenses & attendance; manage waypoints & KPI capture; run exports. **Accounting is strictly read-only** — no posting or approving financial transactions. **Cannot** manage users or companies.

### 4. Staff (`STAFF`)

**Visibility without change rights.** Broad **read-only** across the business — no create, edit, post, or approve rights, no admin, and no audit-log access.

### 5. Driver (`DRIVER`)

**Field drivers on a phone/tablet.** The most restricted level — only their **own** delivery jobs and daily reports (own-jobs enforced at the query layer). Confined to the driver portal; blocked from every admin screen.

### Custom levels

Beyond these five, an admin can create **custom roles** with any combination of the 96 permissions and assign them to users — the custom role then overrides that user's system-level defaults.

## 3. Level capability comparison

| Capability | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| View dashboards & data | ✓ | ✓ | ✓ | ✓ | own only |
| Edit operations (orders / trips / dispatch) | ✓ | read | ✓ | read | — |
| Post / approve accounting | ✓ | ✓ | — | — | — |
| Inventory / procurement / warehouse | ✓ | read (+approve POs) | edit | read | — |
| Payroll / HR / assets / attendance approval | ✓ | ✓ | — | read | — |
| View audit log | ✓ | ✓ | — | — | — |
| Manage users & roles | ✓ | — | — | — | — |
| Manage companies | ✓ | — | — | — | — |

The guiding principle is **separation of duties**: posting/approval authority (Finance) and operational editing (Dispatcher) never overlap, and user/company administration is Admin-only.

## 4. Function of each permission

Permissions are named `resource:action`. Action verbs: `:read` (view) · `:write` (create/edit) · `:post`/`:invoice`/`:disburse` (commit a transaction to the ledger — the sensitive step, kept separate from `:write`) · `:approve` (authorize a workflow step) · `:run`/`:convert`/`:review`/`:manage` (batch process · cross-module conversion · confirm others' work · administer).

### General & cross-cutting

| Permission | Function |
|---|---|
| `dashboard:view` | View the KPI dashboard |
| `activity:read` | View the audit log (who changed what, when) |
| `export:run` | Run PDF / CSV exports |
| `tracking:read` | View live vehicle positions |

### Fleet & drivers

| Permission | Function |
|---|---|
| `driver:read` | View the driver registry |
| `driver:write` | Create & edit drivers, documents, availability |
| `vehicle:read` | View the vehicle registry |
| `vehicle:write` | Create & edit vehicles and maintenance |
| `compliance:read` | View the document-expiry & fuel-efficiency dashboard |
| `waypoint:read` | View the GPS waypoint registry |
| `waypoint:write` | Create & edit waypoints (checkpoints, borders, weighbridges) |

### Freight operations

| Permission | Function |
|---|---|
| `order:read` | View freight orders |
| `order:write` | Create & edit freight orders |
| `order:invoice` | Post an order's AR invoice to the ledger |
| `trip:read` | View trips & trip P&L |
| `trip:write` | Create & edit trips and their expenses |
| `job:read` | View delivery jobs |
| `job:write` | Create & edit delivery jobs |
| `dispatch:read` | View dispatch |
| `dispatch:write` | Assign a driver + vehicle (with conflict-checking) |
| `planning:read` | View master planning & the capacity plan |
| `planning:write` | Enter demand forecasts |
| `report:read` | View daily reports |
| `report:write` | Create / edit a daily report |
| `report:review` | Confirm submitted reports (dispatcher/admin) |
| `client:read` | View the client master |
| `client:write` | Create & edit clients |

### Sales, retail & projects

| Permission | Function |
|---|---|
| `sales:read` | View CRM leads & quotations |
| `sales:write` | Create & edit leads & quotes |
| `sales:convert` | Convert an accepted quote into a freight order |
| `pos:read` | View retail POS sales |
| `pos:write` | Ring up / void POS sales |
| `project:read` | View projects / contracts & their P&L |
| `project:write` | Create & edit projects; attach/detach orders |

### Accounting core

| Permission | Function |
|---|---|
| `account:read` | View the chart of accounts |
| `account:write` | Maintain the chart of accounts |
| `ledger:read` | View journal entries |
| `ledger:write` | Create / edit DRAFT journal entries |
| `ledger:post` | Post & reverse journal entries |
| `payment:read` | View payments |
| `payment:write` | Finalize payments (e.g. driver payroll) |
| `period:read` | View the fiscal calendar |
| `period:manage` | Open / close fiscal periods |

### Payables, receivables & tax

| Permission | Function |
|---|---|
| `vendor:read` | View the vendor master |
| `vendor:write` | Create & edit vendors |
| `payable:read` | View AP bills |
| `payable:write` | Create AP bills |
| `payable:post` | Post bills & payments to the ledger |
| `customer:read` | View the customer master |
| `customer:write` | Create & edit customers |
| `receivable:read` | View AR invoices |
| `receivable:write` | Create AR invoices |
| `receivable:post` | Post invoices & receipts to the ledger |
| `collection:read` | View aging buckets & collections |
| `collection:write` | Dunning, disputes, promise-to-pay, contact log |
| `collection:approve` | Write off bad debt (posts to the ledger) |
| `tax:read` | View VAT / WHT returns |
| `tax:write` | Prepare VAT / WHT returns |

### Treasury, currency & budgets

| Permission | Function |
|---|---|
| `bank:read` | View cash / bank / mobile-money accounts |
| `bank:write` | Maintain bank / mobile-money accounts |
| `bank:disburse` | Post driver disbursements to the ledger |
| `fx:read` | View exchange rates |
| `fx:write` | Maintain rates & run period-end revaluation |
| `consolidation:read` | View subsidiary→parent mapping |
| `consolidation:run` | Run the consolidation rollup |
| `budget:read` | View budgets |
| `budget:write` | Create & edit budgets |

### Inventory & procurement

| Permission | Function |
|---|---|
| `inventory:read` | View stock items & movements |
| `inventory:write` | Receipts / issues / adjustments (also gates product attributes, units of measure, cost variance) |
| `warehouse:read` | View warehouses & stock balances |
| `warehouse:write` | Maintain warehouses & transfers |
| `procurement:read` | View purchase orders & goods receipts |
| `procurement:write` | Create POs & goods receipts |
| `procurement:approve` | Approve POs & the 3-way match |

### Assets & workshop

| Permission | Function |
|---|---|
| `asset:read` | View the fixed-asset register & custody |
| `asset:write` | Create & edit assets; assign custody |
| `asset:approve` | Run depreciation & dispose of assets |
| `service:read` | View workshop service orders |
| `service:write` | Create & edit service orders; issue parts |
| `service:approve` | Complete & post service orders |

### Human capital

| Permission | Function |
|---|---|
| `payroll:read` | View employees & pay runs |
| `payroll:write` | Create & edit pay runs |
| `payroll:approve` | Approve & post pay runs |
| `expense:read` | View expense claims / cash sheets |
| `expense:write` | File & edit expense claims |
| `expense:approve` | Approve & post claims |
| `hr:read` | View contracts, leave, employee documents |
| `hr:write` | Create & edit HR records |
| `hr:approve` | Approve leave & activate contracts |
| `attendance:read` | View time & attendance |
| `attendance:write` | Record time entries |
| `attendance:approve` | Approve timesheets (feeds payroll) |

### Analytics capture

| Permission | Function |
|---|---|
| `kpi:read` | View dock events, damage reports, customer feedback |
| `kpi:write` | Log dock events, damage reports, feedback |

### System administration

| Permission | Function |
|---|---|
| `user:manage` | Manage user accounts (role, home company, active state) |
| `company:manage` | Manage the company registry / legal entities (and the demo sandbox) |

## 5. Appendix — full grant matrix

Exact seeded grants, generated from `DEFAULT_ROLE_PERMISSIONS`. **✓** = granted, **—** = not granted. Totals — Admin 96 · Finance 73 · Dispatcher 55 · Staff 36 · Driver 3.

**General & cross-cutting**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `dashboard:view` | ✓ | ✓ | ✓ | ✓ | — |
| `activity:read` | ✓ | ✓ | — | — | — |
| `export:run` | ✓ | ✓ | ✓ | — | — |
| `tracking:read` | ✓ | ✓ | ✓ | ✓ | — |

**Fleet & drivers**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `driver:read` | ✓ | ✓ | ✓ | ✓ | — |
| `driver:write` | ✓ | — | — | — | — |
| `vehicle:read` | ✓ | ✓ | ✓ | ✓ | — |
| `vehicle:write` | ✓ | — | — | — | — |
| `compliance:read` | ✓ | ✓ | ✓ | ✓ | — |
| `waypoint:read` | ✓ | ✓ | ✓ | ✓ | — |
| `waypoint:write` | ✓ | — | ✓ | — | — |

**Freight operations**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `order:read` | ✓ | ✓ | ✓ | ✓ | — |
| `order:write` | ✓ | — | ✓ | — | — |
| `order:invoice` | ✓ | ✓ | — | — | — |
| `trip:read` | ✓ | ✓ | ✓ | ✓ | — |
| `trip:write` | ✓ | — | ✓ | — | — |
| `job:read` | ✓ | — | ✓ | ✓ | ✓ |
| `job:write` | ✓ | — | ✓ | — | — |
| `dispatch:read` | ✓ | — | ✓ | ✓ | — |
| `dispatch:write` | ✓ | — | ✓ | — | — |
| `planning:read` | ✓ | ✓ | ✓ | ✓ | — |
| `planning:write` | ✓ | — | ✓ | — | — |
| `report:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `report:write` | ✓ | — | — | — | ✓ |
| `report:review` | ✓ | — | ✓ | — | — |
| `client:read` | ✓ | ✓ | ✓ | ✓ | — |
| `client:write` | ✓ | — | ✓ | — | — |

**Sales, retail & projects**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `sales:read` | ✓ | ✓ | ✓ | ✓ | — |
| `sales:write` | ✓ | — | ✓ | — | — |
| `sales:convert` | ✓ | — | ✓ | — | — |
| `pos:read` | ✓ | ✓ | ✓ | ✓ | — |
| `pos:write` | ✓ | — | ✓ | — | — |
| `project:read` | ✓ | ✓ | ✓ | ✓ | — |
| `project:write` | ✓ | ✓ | ✓ | — | — |

**Accounting core**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `account:read` | ✓ | ✓ | ✓ | ✓ | — |
| `account:write` | ✓ | ✓ | — | — | — |
| `ledger:read` | ✓ | ✓ | ✓ | ✓ | — |
| `ledger:write` | ✓ | ✓ | — | — | — |
| `ledger:post` | ✓ | ✓ | — | — | — |
| `payment:read` | ✓ | ✓ | ✓ | ✓ | — |
| `payment:write` | ✓ | ✓ | — | — | — |
| `period:read` | ✓ | ✓ | — | ✓ | — |
| `period:manage` | ✓ | ✓ | — | — | — |

**Payables, receivables & tax**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `vendor:read` | ✓ | ✓ | ✓ | ✓ | — |
| `vendor:write` | ✓ | ✓ | — | — | — |
| `payable:read` | ✓ | ✓ | ✓ | ✓ | — |
| `payable:write` | ✓ | ✓ | — | — | — |
| `payable:post` | ✓ | ✓ | — | — | — |
| `customer:read` | ✓ | ✓ | ✓ | ✓ | — |
| `customer:write` | ✓ | ✓ | — | — | — |
| `receivable:read` | ✓ | ✓ | ✓ | ✓ | — |
| `receivable:write` | ✓ | ✓ | — | — | — |
| `receivable:post` | ✓ | ✓ | — | — | — |
| `collection:read` | ✓ | ✓ | ✓ | ✓ | — |
| `collection:write` | ✓ | ✓ | — | — | — |
| `collection:approve` | ✓ | ✓ | — | — | — |
| `tax:read` | ✓ | ✓ | — | ✓ | — |
| `tax:write` | ✓ | ✓ | — | — | — |

**Treasury, currency & budgets**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `bank:read` | ✓ | ✓ | ✓ | ✓ | — |
| `bank:write` | ✓ | ✓ | — | — | — |
| `bank:disburse` | ✓ | ✓ | — | — | — |
| `fx:read` | ✓ | ✓ | ✓ | ✓ | — |
| `fx:write` | ✓ | ✓ | — | — | — |
| `consolidation:read` | ✓ | ✓ | — | ✓ | — |
| `consolidation:run` | ✓ | ✓ | — | — | — |
| `budget:read` | ✓ | ✓ | ✓ | ✓ | — |
| `budget:write` | ✓ | ✓ | — | — | — |

**Inventory & procurement**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `inventory:read` | ✓ | ✓ | ✓ | ✓ | — |
| `inventory:write` | ✓ | — | ✓ | — | — |
| `warehouse:read` | ✓ | ✓ | ✓ | ✓ | — |
| `warehouse:write` | ✓ | — | ✓ | — | — |
| `procurement:read` | ✓ | ✓ | ✓ | ✓ | — |
| `procurement:write` | ✓ | — | ✓ | — | — |
| `procurement:approve` | ✓ | ✓ | — | — | — |

**Assets & workshop**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `asset:read` | ✓ | ✓ | — | — | — |
| `asset:write` | ✓ | ✓ | — | — | — |
| `asset:approve` | ✓ | ✓ | — | — | — |
| `service:read` | ✓ | ✓ | ✓ | — | — |
| `service:write` | ✓ | — | ✓ | — | — |
| `service:approve` | ✓ | ✓ | ✓ | — | — |

**Human capital**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `payroll:read` | ✓ | ✓ | — | ✓ | — |
| `payroll:write` | ✓ | ✓ | — | — | — |
| `payroll:approve` | ✓ | ✓ | — | — | — |
| `expense:read` | ✓ | ✓ | ✓ | ✓ | — |
| `expense:write` | ✓ | ✓ | ✓ | — | — |
| `expense:approve` | ✓ | ✓ | — | — | — |
| `hr:read` | ✓ | ✓ | — | — | — |
| `hr:write` | ✓ | ✓ | — | — | — |
| `hr:approve` | ✓ | ✓ | — | — | — |
| `attendance:read` | ✓ | ✓ | ✓ | — | — |
| `attendance:write` | ✓ | ✓ | ✓ | — | — |
| `attendance:approve` | ✓ | ✓ | — | — | — |

**Analytics capture**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `kpi:read` | ✓ | ✓ | ✓ | ✓ | — |
| `kpi:write` | ✓ | — | ✓ | — | — |

**System administration**

| Permission | Admin | Finance | Dispatcher | Staff | Driver |
|---|:--:|:--:|:--:|:--:|:--:|
| `user:manage` | ✓ | — | — | — | — |
| `company:manage` | ✓ | — | — | — | — |

---

_Last updated: 2026-08-13. Generated from `backend/src/lib/rbac.ts`; the code is the source of truth. Runtime grants may differ if an admin has edited a level in the Roles & Permissions screen._
