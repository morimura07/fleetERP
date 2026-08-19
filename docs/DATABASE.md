# Database Design

PostgreSQL with Prisma. **79 models, 69 enums, 38 migrations.** Physical table names
are snake_case via `@@map`. All monetary amounts use `Decimal` (141 columns); a few
legacy domestic-delivery values are still `Int`.

`backend/prisma/schema.prisma` is the authoritative column-level reference. This
document covers the design rules that are not obvious from reading it.

---

## 1. Tenancy: the two levels above every record

```
Organization          the tenant boundary (parent company). Separate customers.
  └─ Company          a legal entity. Its `code` IS the dataAreaId.
       └─ business records, each carrying `dataAreaId`
```

**60 of 79 models carry `dataAreaId`.** It is a plain string column, not a foreign key,
holding the owning `Company.code` (`HQ01`, `KE01`, …). Isolation is enforced at the
query layer by `backend/src/lib/scope.ts`, never by the database.

The 19 models without it fall into three groups, and the reason matters:

| Group | Models | Why no `dataAreaId` |
|---|---|---|
| Above tenancy | `Organization`, `Company` | They *define* the partitions |
| Cross-tenant infrastructure | `User`, `Notification`, `ActivityLog`, `RbacPermission`, `RbacRole`, `RbacRolePermission` | Auth and audit span the platform. `User` instead carries its own `dataAreaId` for the entity the user belongs to |
| Child rows | `JournalLine`, `TripExpense`, `BudgetLine`, `PurchaseOrderLine`, `GoodsReceiptLine`, `ExpenseLine`, `Payslip`, `StockBalance`, `VendorPayment`, `CustomerReceipt`, `ConsolidationMap`, `Payment` | They inherit the partition from their parent and cascade with it |

> **Adding a partitioned model?** Give it `dataAreaId`, scope every query with
> `areaScope(user)`, and guard single fetches with `assertSameArea(user, row)`.
> A model that forgets this is invisible to the isolation tests and leaks across tenants.

## 2. Cross-cutting columns

| Column | Coverage | Purpose |
|---|---|---|
| `dataAreaId` | 60 models | Tenant partition (above) |
| `version Int @default(0)` | 45 models | Optimistic concurrency (PRD §7.1) via `updateWithVersion()`; a stale write is rejected with 409 rather than clobbering |
| `createdById` | 49 models | Audit: who created the row |
| `updatedById` | 43 models | Audit: who last changed it |

Every write is additionally recorded in `ActivityLog`, and the master-data update
routes capture a field-level before→after diff through `diffFields()`.

## 3. Referential integrity

44 `Cascade`, 51 `SetNull`, 15 `Restrict`. The choice encodes intent:

- **Cascade** — the child has no meaning without its parent. Deleting an `Order` removes its `Trip`s; deleting a `JournalEntry` removes its `JournalLine`s.
- **SetNull** — the reference is informational. Deleting a `User` nulls the `createdById` on everything they touched rather than destroying business history.
- **Restrict** — deletion would orphan real data. An `Organization` holding companies, a `Driver` on a trip, and a `Client` with orders all refuse to delete.

## 4. Domain map

**Tenancy & auth** — `Organization`, `Company`, `User`, `RbacRole`, `RbacPermission`,
`RbacRolePermission`, `ActivityLog`, `Notification`

**Accounting** — `Account` (self-referencing chart-of-accounts tree), `JournalEntry`,
`JournalLine`, `FiscalPeriod`

**Freight** — `Order`, `Trip`, `TripExpense`

**Fleet & drivers** — `Driver`, `DriverAvailability`, `Holiday`, `DriverDocument`,
`Vehicle`, `VehicleMaintenance`, `VehiclePosition`, `GpsWaypoint`

**Domestic delivery** — `Client`, `DeliveryJob`, `Dispatch`, `DailyReport`, `Payment`

**AP / AR / collections** — `Vendor`, `VendorInvoice`, `VendorPayment`, `Customer`,
`CustomerInvoice`, `CustomerReceipt`, `CollectionActivity`

**Core finance** — `Budget`, `BudgetLine`, `BankAccount`, `MoneyTransfer`,
`ConsolidationMap`, `ExchangeRate`

**Inventory & supply chain** — `StockItem`, `StockMovement`, `StockBalance`, `Warehouse`,
`UnitOfMeasure`, `ProductAttribute`, `StockItemAttribute`, `PurchaseOrder`,
`PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`

**Assets & workshop** — `FixedAsset`, `DepreciationEntry`, `AssetAssignment`,
`ServiceOrder`, `ServicePart`, `ServiceLabor`

**Human capital** — `Employee`, `EmploymentContract`, `EmployeeDocument`, `PayRun`,
`Payslip`, `ExpenseClaim`, `ExpenseLine`, `LeaveRequest`, `LeaveBalance`, `TimeEntry`,
`Timesheet`

**Commercial** — `Lead`, `SalesQuote`, `SalesQuoteLine`, `Project`, `DemandForecast`,
`PosSale`, `PosSaleLine`

**Service quality** — `DockEvent`, `DamageReport`, `CustomerFeedback`

## 5. Key relationships

```
# Tenancy
Organization 1──* Company                      # Restrict: a parent with entities cannot be deleted
Company.code ──> dataAreaId on 60 models       # by value, not by foreign key

# Accounting
Account 1──* Account                           # self-referencing chart-of-accounts tree
JournalEntry 1──* JournalLine                  # must balance; POSTED is immutable
JournalEntry 0..1──0..1 JournalEntry           # reversalOf: the contra-entry trail
JournalEntry 0..1── Order                      # the AR invoice link
JournalEntry 0..1── TripExpense                # the expense posting link

# Freight
Client 1──* Order 1──* Trip 1──* TripExpense   # MANY trips per order (10-15 trucks)
Driver 1──* Trip        Vehicle 1──* Trip
Vehicle 0..1── Driver                          # defaultDriver: pre-fills dispatch
Project 1──* Order                             # contract grouping, budget vs actual

# Inventory
StockItem 1──* StockMovement                   # moving-average cost recomputed per movement
StockItem 1──* StockBalance ──1 Warehouse      # per-location on-hand
PurchaseOrder 1──* GoodsReceipt                # 3-way match: PO / receipt / invoice
```

## 6. Rules the schema alone does not tell you

**A posted journal entry is immutable.** Corrections go through a contra-entry that
links back via `reversalOf`. This is an audit requirement, enforced in
`services/ledger.ts`, not by a database constraint.

**Entries must balance.** Debits equal credits, checked before write. A `JournalEntry`
that does not balance is never persisted.

**A closed fiscal period rejects new postings.** `FiscalPeriod` is checked inside
`createJournalEntry`, so every posting path — invoices, POS, payroll, revaluation —
respects it without each one implementing the check.

**`Company.code` cannot change after creation.** It is the partition key already stamped
on every child record; renaming it would orphan that data. The same applies to
`Organization.code`, which the runtime scope map resolves through.

**One order, many trips.** `Trip.orderId` was unique until August 2026. A large
consignment goes out on 10 to 15 trucks, so cost rollups must sum across all of them
and on-time delivery is judged against the *last* arrival.

## 7. Migrations

38 migrations under `backend/prisma/migrations/`, applied with `prisma migrate deploy`.

Two conventions worth keeping:

- **Additive first.** A NOT NULL column on a populated table is added nullable, backfilled, then constrained — see `20260818140000_add_organization_tenancy`, which does exactly that for `Company.organizationId`.
- **New enum values go last.** Postgres forbids using an enum value in the same transaction that creates it.

> Some early schema changes were applied with `prisma db push`, which does not record a
> migration. If `migrate deploy` fails with "type already exists", the objects are present
> but unrecorded — resolve with `prisma migrate resolve --applied <name>` after confirming
> with `prisma migrate diff` that the database really does match the schema.
