# Database Design

PostgreSQL with Prisma. **19 models.** Physical table names are snake_case via `@@map`. All monetary ledger/freight amounts use `Decimal`; legacy domestic values use `Int`.

## Domain overview

The schema spans four domains:

- **Auth & org** — `User`, `ActivityLog`, `Notification`
- **Accounting** — `Account`, `JournalEntry`, `JournalLine`
- **Freight** — `Order`, `Trip`, `TripExpense`
- **Fleet / domestic delivery** — `Driver`, `DriverAvailability`, `Holiday`, `Vehicle`, `VehicleMaintenance`, `Client`, `DeliveryJob`, `Dispatch`, `DailyReport`, `Payment`

## ER overview

```
User 1──0..1 Driver
User 1──* Notification | ActivityLog | Dispatch(createdBy) | JournalEntry(createdBy) | Order(createdBy) | Trip(createdBy)

# Accounting
Account 1──* Account (self, parent/children)       # chart-of-accounts tree
Account 1──* JournalLine
JournalEntry 1──* JournalLine
JournalEntry 0..1──0..1 JournalEntry (reversalOf)  # reversal trail
JournalEntry 0..1── Order (invoice)                # AR invoice link
JournalEntry 0..1── TripExpense (entry)            # expense posting link

# Freight
Client 1──* Order 1──0..1 Trip 1──* TripExpense
Driver 1──* Trip      Vehicle 1──* Trip

# Fleet / domestic
Driver 1──* DriverAvailability | Holiday | Dispatch | DailyReport | Payment
Vehicle 1──* VehicleMaintenance | Dispatch
Client 1──* DeliveryJob 1──0..1 Dispatch
DeliveryJob 1──0..1 DailyReport
```

## Enums

| Enum | Values |
|------|--------|
| Role | ADMIN, DISPATCHER, FINANCE, DRIVER, STAFF |
| DriverStatus | ACTIVE, VACATION, INACTIVE |
| ContractType | EMPLOYEE, CONTRACTOR, PARTTIME |
| VehicleStatus | AVAILABLE, MAINTENANCE, UNAVAILABLE |
| JobStatus | PENDING, WAITING_DISPATCH, ASSIGNED, DELIVERING, COMPLETED, CANCELLED |
| DispatchStatus | SCHEDULED, IN_PROGRESS, DONE, CANCELLED |
| NotificationType | DISPATCH, JOB_UPDATE, COMPLETION, SYSTEM |
| AccountType | ASSET, LIABILITY, EQUITY, INCOME, EXPENSE |
| JournalStatus | DRAFT, POSTED, REVERSED |
| OrderStatus | DRAFT, CONFIRMED, IN_TRANSIT, DELIVERED, INVOICED, CANCELLED |
| TripStatus | PLANNED, DISPATCHED, IN_PROGRESS, COMPLETED, CANCELLED |
| CorridorType | NORTHERN, CENTRAL, DOMESTIC |
| TripExpenseType | FUEL, TOLLS, BORDER_FEES, DRIVER_ALLOWANCE, DEMURRAGE, MAINTENANCE, OTHER |

## Tables (key columns)

### Auth & org

#### users
| Column | Type | Notes |
|--------|------|-------|
| id | cuid | PK |
| name | string | display name |
| email | string | UNIQUE |
| passwordHash | string | bcrypt |
| role | Role | default STAFF |
| isActive | bool | can sign in |
| resetToken / resetTokenExpires | string? / datetime? | password reset |

#### notifications
`userId`, `type`, `title`, `body`, `link`, `isRead`. Index `(userId, isRead)`.

#### activity_logs
`userId?` (→SetNull), `action`, `target` ("Model:id"), `detail` (JSON string), `ipAddress`, `createdAt`. Indexes on `userId`, `createdAt`.

### Accounting

#### accounts
Chart of accounts. `dataAreaId` (legal entity, default "HQ01"), `code`, `name`, `type` (AccountType), `parentId` (self-relation tree, →SetNull), `isActive`.
**UNIQUE `(dataAreaId, code)`.** Index on `type`.

#### journal_entries
A balanced double-entry voucher. `dataAreaId`, `voucherNumber`, `postingDate` (DATE), `currency` (ISO 4217, default USD), `exchangeRate` (Decimal 18,6 — recorded per posting), `memo`, `status` (JournalStatus), `reversalOfId` (UNIQUE self-relation, →SetNull), `postedAt`, `createdById` (→SetNull).
**UNIQUE `(dataAreaId, voucherNumber)`.** Indexes on `status`, `postingDate`.

#### journal_lines
One side of a posting. `entryId` (→Cascade), `accountId` (→Restrict), `debit` / `credit` (Decimal 18,2, default 0), `memo`, `dimension` (free-form branch/cost-object tag). Indexes on `entryId`, `accountId`.
**Invariant (app layer):** exactly one of debit/credit is non-zero per line, and `SUM(debit) == SUM(credit)` per entry.

### Freight

#### orders
Cross-border freight booking. `dataAreaId`, `orderCode` (UNIQUE), `clientId` (→Restrict), `originZone`, `destinationZone`, `corridor` (CorridorType), `cargoDescription`, `grossWeightKg` / `volumeCbm` (Decimal 12,2), `freightAmount` / `demurrageAmount` (Decimal 18,2), `currency`, `bookingDate` (DATE), `status` (OrderStatus), `invoiceEntryId` (UNIQUE → JournalEntry, →SetNull), `createdById` (→SetNull). Indexes on `status`, `clientId`, `bookingDate`.

#### trips
Execution of an order. `dataAreaId`, `tripCode` (UNIQUE), `orderId` (UNIQUE→Cascade), `driverId` / `vehicleId` (→Restrict), `corridor`, `mileageKm` / `transitHours` (Decimal), `scheduledStart`, `scheduledEnd`, `status` (TripStatus), `createdById` (→SetNull). Indexes on `(driverId, scheduledStart)`, `(vehicleId, scheduledStart)`, `status`.

#### trip_expenses
`tripId` (→Cascade), `type` (TripExpenseType), `amount` (Decimal 18,2), `currency`, `note`, `entryId` (UNIQUE → JournalEntry, →SetNull). Index on `tripId`.

### Fleet / domestic delivery

#### drivers
`name`, `email` (UNIQUE), `phone`, `address`, `contractType`, `joinedAt`, `status`. `userId` links to User 1:1 (optional). Index on `status`.

#### driver_availabilities
**UNIQUE `(driverId, weekday)`.** weekday 0=Sun..6=Sat, `startTime`/`endTime` as "HH:mm".

#### holidays
**UNIQUE `(driverId, date)`.** `date` is DATE. Index on `date`.

#### vehicles
`vehicleNumber` (UNIQUE), `plateNumber` (UNIQUE), `maker`, `model`, `insuranceExpiry` (DATE), `inspectionExpiry` (DATE), `status`. Index on `status`.

#### vehicle_maintenances
`maintenanceType`, `date` (DATE), `cost` (Int), `note`. Index on `vehicleId`.

#### clients
`companyName`, `contactPerson`, `phone`, `address`, `email`. Index on `companyName`.

#### delivery_jobs
`jobCode` (UNIQUE), `clientId` (→Restrict), `pickupAddress`, `deliveryAddress`, `deliveryDate`, `cargoDescription`, `rewardAmount` (Int), `note`, `status`. Indexes on `status`, `deliveryDate`, `clientId`.

#### dispatches
`jobId` (UNIQUE→Cascade), `driverId` / `vehicleId` (→Restrict), `scheduledStart`, `scheduledEnd`, `status`, `createdById`. Indexes on `(driverId, scheduledStart)`, `(vehicleId, scheduledStart)` — speeds up conflict checks.

#### daily_reports
`jobId` (UNIQUE), `driverId`, `workStart`, `workEnd`, `mileage` (km), `note`, `proofImageUrl`.

#### payments
**UNIQUE `(driverId, year, month)`.** `totalAmount`, `jobCount`, `finalizedAt`. Holds the finalized monthly aggregate.

## Referential-integrity policy

- **Restrict** — DeliveryJob→Client, Dispatch→Driver/Vehicle, Order→Client, Trip→Driver/Vehicle, JournalLine→Account (preserve history; block parent deletion while referenced).
- **Cascade** — Dispatch/DailyReport→DeliveryJob, Availability/Holiday→Driver, JournalLine→JournalEntry, Trip→Order, TripExpense→Trip.
- **SetNull** — Driver→User, ActivityLog→User, `createdBy` links, and ledger links on Order/TripExpense (keep records when the related entity is removed).

## Invariants (enforced at the application layer)

**Accounting** (`lib/services/ledger.ts`)
- A journal entry must balance: `SUM(debit) == SUM(credit)`, each line has exactly one non-zero side, amounts ≥ 0, ≥ 2 lines.
- Posted entries are immutable; corrections are made by a REVERSED contra-entry (debits/credits swapped), never by edit/delete.
- Voucher numbers are sequential per legal entity (`JV-000001`).

**Freight** (`lib/services/freight.ts`)
- Invoicing an order posts **Dr Accounts Receivable (1100) / Cr Freight Revenue (4000)** (+ Cr Demurrage Income (4100) when applicable) and sets the order to INVOICED. Idempotent — an already-invoiced order is rejected.
- Posting a trip expense posts **Dr <expense account> / Cr Accounts Payable (2000)**; the expense type maps 1:1 to a chart-of-accounts code.
- Trip P&L = order revenue (freight + demurrage) − sum of trip expenses.

**Domestic delivery**
- A dispatch cannot overlap the same driver/vehicle in time (`checkDispatchConflict`).
- A daily report can only be filed by the job's assigned driver; filing transitions the job to COMPLETED and the dispatch to DONE.
- Monthly payment = sum of `rewardAmount` over COMPLETED jobs in the month, grouped by driver.
