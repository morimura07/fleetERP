import "../src/lib/load-env";
import { PrismaClient, AccountType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { invoiceOrder, postTripExpense } from "@backend/services/freight";

const prisma = new PrismaClient();
const hash = (p: string) => bcrypt.hash(p, 12);

// Standard logistics-ERP chart of accounts (single legal entity HQ01 for MVP).
// Ranges: 1xxx Asset, 2xxx Liability, 3xxx Equity, 4xxx Income, 5xxx–6xxx Expense.
const DATA_AREA = "HQ01";
const CHART_OF_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  // ── Assets ──
  { code: "1000", name: "Cash on Hand", type: "ASSET" },
  { code: "1010", name: "Bank — CRDB", type: "ASSET" },
  { code: "1020", name: "Bank — KCB", type: "ASSET" },
  { code: "1030", name: "Mobile Money Float (M-Pesa/Airtel)", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1200", name: "Driver Advances", type: "ASSET" },
  { code: "1300", name: "Inventory — Spare Parts & Fuel", type: "ASSET" },
  { code: "1310", name: "VAT Recoverable (Input VAT)", type: "ASSET" },
  { code: "1500", name: "Vehicles & Fleet (Fixed Assets)", type: "ASSET" },
  { code: "1510", name: "Accumulated Depreciation — Fleet", type: "ASSET" },
  // ── Liabilities ──
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "VAT Payable", type: "LIABILITY" },
  { code: "2110", name: "Withholding Tax Payable", type: "LIABILITY" },
  { code: "2200", name: "PAYE Payable", type: "LIABILITY" },
  { code: "2210", name: "NSSF/SHIF Payable", type: "LIABILITY" },
  { code: "2300", name: "Accrued Expenses", type: "LIABILITY" },
  // ── Equity ──
  { code: "3000", name: "Share Capital", type: "EQUITY" },
  { code: "3100", name: "Retained Earnings", type: "EQUITY" },
  // ── Income ──
  { code: "4000", name: "Freight Revenue", type: "INCOME" },
  { code: "4100", name: "Demurrage Income", type: "INCOME" },
  { code: "4200", name: "Other Operating Income", type: "INCOME" },
  { code: "4900", name: "Foreign Exchange Gain", type: "INCOME" },
  // ── Expenses ──
  { code: "5000", name: "Fuel Expense", type: "EXPENSE" },
  { code: "5010", name: "Tolls & Road Fees", type: "EXPENSE" },
  { code: "5020", name: "Border & Clearing Fees", type: "EXPENSE" },
  { code: "5030", name: "Driver Allowances", type: "EXPENSE" },
  { code: "5040", name: "Demurrage Expense", type: "EXPENSE" },
  { code: "5100", name: "Vehicle Maintenance & Repairs", type: "EXPENSE" },
  { code: "5110", name: "Insurance Expense", type: "EXPENSE" },
  { code: "5200", name: "Depreciation Expense — Fleet", type: "EXPENSE" },
  { code: "6000", name: "Salaries & Wages", type: "EXPENSE" },
  { code: "6100", name: "Office & Administrative Expense", type: "EXPENSE" },
  { code: "6900", name: "Foreign Exchange Loss", type: "EXPENSE" },
];

async function main() {
  console.log("Seeding FleetFlow...");

  // ── Users (one per role) ──
  const [adminPw, dispatcherPw, financePw, staffPw, driverPw] = await Promise.all([
    hash("admin1234"), hash("dispatch1234"), hash("finance1234"), hash("staff1234"), hash("driver1234"),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: "admin@fleetflow.local" },
    update: {},
    create: { name: "Admin User", email: "admin@fleetflow.local", passwordHash: adminPw, role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "dispatcher@fleetflow.local" },
    update: {},
    create: { name: "Olivia Planner", email: "dispatcher@fleetflow.local", passwordHash: dispatcherPw, role: "DISPATCHER" },
  });
  await prisma.user.upsert({
    where: { email: "finance@fleetflow.local" },
    update: {},
    create: { name: "Frank Controller", email: "finance@fleetflow.local", passwordHash: financePw, role: "FINANCE" },
  });
  await prisma.user.upsert({
    where: { email: "staff@fleetflow.local" },
    update: {},
    create: { name: "Sam Staff", email: "staff@fleetflow.local", passwordHash: staffPw, role: "STAFF" },
  });

  // ── Driver + linked login ──
  const driverUser = await prisma.user.upsert({
    where: { email: "driver@fleetflow.local" },
    update: {},
    create: { name: "James Mwangi", email: "driver@fleetflow.local", passwordHash: driverPw, role: "DRIVER" },
  });
  const driver = await prisma.driver.upsert({
    where: { email: "driver@fleetflow.local" },
    update: {},
    create: {
      userId: driverUser.id, name: "James Mwangi", email: "driver@fleetflow.local",
      phone: "090-1111-2222", address: "Mombasa, Kenya", contractType: "CONTRACTOR",
      joinedAt: new Date("2024-04-01"), status: "ACTIVE",
    },
  });
  const driver2 = await prisma.driver.upsert({
    where: { email: "suzuki@fleetflow.local" },
    update: {},
    create: {
      name: "Daniel Otieno", email: "suzuki@fleetflow.local", phone: "090-3333-4444",
      address: "Dar es Salaam, Tanzania", contractType: "EMPLOYEE", joinedAt: new Date("2023-10-01"), status: "ACTIVE",
    },
  });

  // weekday availability for driver 1 (Mon-Fri 9-18)
  for (let w = 1; w <= 5; w++) {
    await prisma.driverAvailability.upsert({
      where: { driverId_weekday: { driverId: driver.id, weekday: w } },
      update: {},
      create: { driverId: driver.id, weekday: w, startTime: "09:00", endTime: "18:00", isActive: true },
    });
  }

  // ── Vehicles ──
  const vehicle = await prisma.vehicle.upsert({
    where: { vehicleNumber: "V-001" },
    update: {},
    create: {
      vehicleNumber: "V-001", plateNumber: "T 123 ABC", maker: "Honda", model: "N-VAN",
      insuranceExpiry: new Date("2027-03-31"), inspectionExpiry: new Date("2026-12-31"), status: "AVAILABLE",
    },
  });
  await prisma.vehicle.upsert({
    where: { vehicleNumber: "V-002" },
    update: {},
    create: {
      vehicleNumber: "V-002", plateNumber: "KAA 456B", maker: "Suzuki", model: "Every",
      insuranceExpiry: new Date("2027-01-31"), inspectionExpiry: new Date("2026-08-31"), status: "AVAILABLE",
    },
  });

  // ── Client ──
  const client = await prisma.client.create({
    data: {
      companyName: "Sample Logistics Ltd", contactPerson: "Grace Sales", phone: "03-1234-5678",
      address: "Nairobi, Kenya", email: "contact@sample-logi.co.jp",
    },
  }).catch(async () => (await prisma.client.findFirst())!);

  // ── Jobs ──
  const today = new Date();
  const job = await prisma.deliveryJob.create({
    data: {
      jobCode: `J-${Date.now().toString().slice(-6)}`, clientId: client.id,
      pickupAddress: "Mombasa Port", deliveryAddress: "Nairobi Depot",
      deliveryDate: today, cargoDescription: "Electronics, 5 crates", rewardAmount: 12000, status: "WAITING_DISPATCH",
    },
  });

  // ── Dispatch for today ──
  const start = new Date(today); start.setHours(10, 0, 0, 0);
  const end = new Date(today); end.setHours(14, 0, 0, 0);
  await prisma.dispatch.create({
    data: {
      jobId: job.id, driverId: driver.id, vehicleId: vehicle.id,
      scheduledStart: start, scheduledEnd: end, status: "SCHEDULED", createdById: admin.id,
    },
  });
  await prisma.deliveryJob.update({ where: { id: job.id }, data: { status: "ASSIGNED" } });

  // A completed job last month (for payment demo)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const doneJob = await prisma.deliveryJob.create({
    data: {
      jobCode: `J-DONE-${Date.now().toString().slice(-4)}`, clientId: client.id,
      pickupAddress: "Warehouse A", deliveryAddress: "Store B", deliveryDate: lastMonth,
      cargoDescription: "Consumer goods", rewardAmount: 9000, status: "COMPLETED",
    },
  });
  await prisma.dispatch.create({
    data: {
      jobId: doneJob.id, driverId: driver2.id, vehicleId: vehicle.id,
      scheduledStart: new Date(lastMonth.setHours(9)), scheduledEnd: new Date(lastMonth.setHours(12)),
      status: "DONE",
    },
  });

  // ── Chart of Accounts ──
  for (const a of CHART_OF_ACCOUNTS) {
    await prisma.account.upsert({
      where: { dataAreaId_code: { dataAreaId: DATA_AREA, code: a.code } },
      update: { name: a.name, type: a.type },
      create: { dataAreaId: DATA_AREA, code: a.code, name: a.name, type: a.type },
    });
  }
  console.log(`  Chart of accounts: ${CHART_OF_ACCOUNTS.length} accounts (${DATA_AREA})`);

  // ── Demo Orders & Trips (freight) ──
  // Guarded: only seed when there are no orders yet, so re-running stays clean
  // (order/trip codes are time-based and not upsertable).
  if ((await prisma.order.count()) === 0) {
    const code = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // (1) Showcase: confirmed → trip with posted expenses → invoiced. Demonstrates
    //     the full P&L loop (revenue from invoice, expenses posted to the ledger).
    const order1 = await prisma.order.create({
      data: {
        dataAreaId: DATA_AREA, orderCode: code("ORD"), clientId: client.id,
        originZone: "Dar es Salaam Port", destinationZone: "Lusaka Depot", corridor: "CENTRAL",
        cargoDescription: "FMCG 24t (40ft container)",
        grossWeightKg: "24000", volumeCbm: "67.7",
        freightAmount: "6800.00", demurrageAmount: "450.00", currency: "USD",
        bookingDate: new Date(), status: "CONFIRMED", createdById: admin.id,
      },
    });
    const trip1 = await prisma.trip.create({
      data: {
        dataAreaId: DATA_AREA, tripCode: code("TRP"), orderId: order1.id,
        driverId: driver.id, vehicleId: vehicle.id, corridor: "CENTRAL",
        mileageKm: "1980", transitHours: "52",
        scheduledStart: new Date(today.getTime() - 3 * 86400000),
        scheduledEnd: new Date(today.getTime() - 1 * 86400000),
        status: "COMPLETED", createdById: admin.id,
      },
    });
    await prisma.order.update({ where: { id: order1.id }, data: { status: "IN_TRANSIT" } });
    for (const e of [
      { type: "FUEL" as const, amount: "2100.00" },
      { type: "TOLLS" as const, amount: "180.00" },
      { type: "BORDER_FEES" as const, amount: "320.00" },
      { type: "DRIVER_ALLOWANCE" as const, amount: "400.00" },
    ]) {
      const exp = await prisma.tripExpense.create({
        data: { tripId: trip1.id, type: e.type, amount: e.amount, currency: "USD" },
      });
      await postTripExpense(exp.id, admin.id); // Dr expense / Cr A/P
    }
    await invoiceOrder(order1.id, admin.id); // Dr A/R / Cr Freight (+ Demurrage); order → INVOICED

    // (2) In transit, not yet invoiced.
    const order2 = await prisma.order.create({
      data: {
        dataAreaId: DATA_AREA, orderCode: code("ORD"), clientId: client.id,
        originZone: "Mombasa Port", destinationZone: "Kigali Depot", corridor: "NORTHERN",
        cargoDescription: "Steel coils 18t",
        grossWeightKg: "18000", volumeCbm: "12.0",
        freightAmount: "5200.00", currency: "USD",
        bookingDate: new Date(), status: "CONFIRMED", createdById: admin.id,
      },
    });
    const trip2 = await prisma.trip.create({
      data: {
        dataAreaId: DATA_AREA, tripCode: code("TRP"), orderId: order2.id,
        driverId: driver2.id, vehicleId: vehicle.id, corridor: "NORTHERN",
        mileageKm: "1700", transitHours: "44",
        scheduledStart: new Date(today.getTime() - 1 * 86400000),
        scheduledEnd: new Date(today.getTime() + 1 * 86400000),
        status: "IN_PROGRESS", createdById: admin.id,
      },
    });
    await prisma.order.update({ where: { id: order2.id }, data: { status: "IN_TRANSIT" } });
    const exp2 = await prisma.tripExpense.create({
      data: { tripId: trip2.id, type: "FUEL", amount: "1850.00", currency: "USD" },
    });
    await postTripExpense(exp2.id, admin.id);

    // (3) Draft order awaiting dispatch (shows in the /trips create dropdown).
    await prisma.order.create({
      data: {
        dataAreaId: DATA_AREA, orderCode: code("ORD"), clientId: client.id,
        originZone: "Dar es Salaam Port", destinationZone: "Lubumbashi (DRC)", corridor: "CENTRAL",
        cargoDescription: "Mining equipment 30t",
        grossWeightKg: "30000", volumeCbm: "40.0",
        freightAmount: "9500.00", demurrageAmount: "0", currency: "USD",
        bookingDate: new Date(), status: "CONFIRMED", createdById: admin.id,
      },
    });

    console.log("  Demo freight: 3 orders, 2 trips, 5 posted expenses, 1 AR invoice");
  } else {
    console.log("  Demo freight: skipped (orders already exist)");
  }

  // ── Demo AP / AR (M1 / M2) — guarded so re-runs stay clean ──
  if ((await prisma.vendor.count()) === 0) {
    const { postVendorInvoice, payVendorInvoice, postCustomerInvoice, receiveCustomerInvoice } =
      await import("../backend/services/ap-ar");

    // AP: vendor + posted, fully-paid bill
    const vendor = await prisma.vendor.create({
      data: { code: "AP-VND-001", legalName: "Total Fuel Tanzania", group: "FUEL_SUPPLIER", tin: "TZ-123", paymentTerm: "NET_30", currency: "USD" },
    });
    const bill = await prisma.vendorInvoice.create({
      data: {
        vendorId: vendor.id, invoiceNumber: "INV-9001", invoiceDate: new Date(), currency: "USD",
        subtotal: "1000.00", vatAmount: "180.00", whtAmount: "60.00", total: "1120.00", expenseCode: "5000",
      },
    });
    await postVendorInvoice(bill.id, admin.id);
    await payVendorInvoice(bill.id, { amount: "1120.00", paidAt: new Date(), bankCode: "1010" }, admin.id);

    // AR: customer + posted, partially-received invoice
    const customer = await prisma.customer.create({
      data: { code: "AR-CST-001", name: "Apex Distributors", creditLimit: "50000", creditDays: 30, currency: "USD" },
    });
    const arInv = await prisma.customerInvoice.create({
      data: {
        invoiceNumber: "AR-INV-000001", customerId: customer.id, invoiceDate: new Date(), currency: "USD",
        subtotal: "2000.00", vatAmount: "320.00", total: "2320.00", revenueCode: "4000",
      },
    });
    await postCustomerInvoice(arInv.id, admin.id);
    await receiveCustomerInvoice(arInv.id, { amount: "1000.00", receivedAt: new Date(), bankCode: "1010" }, admin.id);

    console.log("  Demo AP/AR: 1 vendor + paid bill, 1 customer + part-paid invoice");
  } else {
    console.log("  Demo AP/AR: skipped (vendors already exist)");
  }

  // ── Demo Phase 2 — Core Finance (M3/M4/M5) — guarded for clean re-runs ──
  if ((await prisma.bankAccount.count()) === 0) {
    const { settleTransfer } = await import("../backend/services/cash-bank");

    // M8 multi-currency: SPOT + AVERAGE rates for the regional currencies (→ USD).
    const today = new Date();
    const rates: [string, "SPOT" | "AVERAGE", string][] = [
      ["TZS", "SPOT", "0.000385"], ["TZS", "AVERAGE", "0.000380"],
      ["KES", "SPOT", "0.00775"], ["KES", "AVERAGE", "0.00770"],
    ];
    for (const [currency, rateType, rate] of rates) {
      await prisma.exchangeRate.create({
        data: { currency, baseCurrency: "USD", rateType, rate, validFrom: today },
      });
    }

    // M4 cash & bank: a USD bank + an M-Pesa mobile-money float.
    const crdb = await prisma.bankAccount.create({
      data: { code: "BANK-CRDB-USD", name: "CRDB — Main USD", type: "BANK", glCode: "1010", currency: "USD", provider: "CRDB", swift: "CORUTZTZ" },
    });
    const mpesa = await prisma.bankAccount.create({
      data: { code: "MM-MPESA-TZS", name: "M-Pesa Float", type: "MOBILE_MONEY", glCode: "1030", currency: "USD", provider: "Safaricom" },
    });

    // A pending and a settled driver disbursement.
    await prisma.moneyTransfer.create({
      data: { reference: "MM-2026-0002", bankAccountId: mpesa.id, driverId: driver.id, type: "BORDER_FEES", amount: "150.00", currency: "USD", expenseCode: "5020", transferredAt: today },
    });
    const settled = await prisma.moneyTransfer.create({
      data: { reference: "MM-2026-0001", bankAccountId: crdb.id, driverId: driver.id, type: "FUEL_ALLOWANCE", amount: "500.00", currency: "USD", expenseCode: "5030", transferredAt: today },
    });
    await settleTransfer(settled.id, admin.id);

    // M3 budgeting: an OpEx budget with two lines under WARNING_ONLY control.
    await prisma.budget.create({
      data: {
        name: "FY2026 Operating Budget", fiscalYear: 2026, control: "WARNING_ONLY", createdById: admin.id,
        lines: {
          create: [
            { kind: "OPEX", costCenter: "Fleet Operations", accountCode: "5000", amount: "100000.00", consumed: "32000.00" },
            { kind: "OPEX", costCenter: "Fleet Operations", accountCode: "5020", amount: "20000.00", consumed: "18500.00" },
          ],
        },
      },
    });

    // M5 consolidations: map a KE01 subsidiary revenue/AR account into HQ01.
    await prisma.consolidationMap.createMany({
      data: [
        { parentArea: "HQ01", subsidiary: "KE01", subAccount: "4000", parentAccount: "4000" },
        { parentArea: "HQ01", subsidiary: "KE01", subAccount: "1100", parentAccount: "1100" },
      ],
    });

    console.log("  Demo Phase 2: 4 FX rates, 2 bank accounts, 2 disbursements, 1 budget, 2 consolidation maps");
  } else {
    console.log("  Demo Phase 2: skipped (bank accounts already exist)");
  }

  // ── Demo Phase 3 — Operations (M11/M12/M30) — guarded for clean re-runs ──
  if ((await prisma.gpsWaypoint.count()) === 0) {
    const day = 86_400_000;
    const now = Date.now();

    // M11 vehicle compliance + fuel target on V-001 (one doc expiring soon).
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        comesaPermitExpiry: new Date(now + 10 * day), // within 14-day window → EXPIRING_SOON
        yellowCardExpiry: new Date(now + 200 * day),
        fuelTargetKmPerL: "3.50",
      },
    });

    // M11 driver compliance documents (one expired, the rest current).
    await prisma.driverDocument.createMany({
      data: [
        { driverId: driver.id, type: "LICENSE", number: "DL-TZ-0091", expiresAt: new Date(now + 300 * day) },
        { driverId: driver.id, type: "PASSPORT", number: "P-TZ-7781", expiresAt: new Date(now + 365 * day) },
        { driverId: driver.id, type: "COMESA_PERMIT", number: "CMS-2025-22", expiresAt: new Date(now - 5 * day) }, // EXPIRED
        { driverId: driver.id, type: "YELLOW_FEVER", number: "YF-3310", expiresAt: new Date(now + 8 * day) }, // EXPIRING_SOON
      ],
    });

    // M30 GPS waypoints — real corridor checkpoints.
    await prisma.gpsWaypoint.createMany({
      data: [
        { code: "CHALINZE", name: "Chalinze Junction", kind: "CHECKPOINT", lat: "-6.638000", lng: "38.357000", country: "TZ" },
        { code: "TUNDUMA", name: "Tunduma Border", kind: "BORDER", lat: "-9.300000", lng: "32.770000", country: "TZ" },
        { code: "MALABA", name: "Malaba Border Post", kind: "BORDER", lat: "0.636000", lng: "34.275000", country: "KE" },
        { code: "NAMANGA", name: "Namanga Border", kind: "BORDER", lat: "-2.545000", lng: "36.792000", country: "KE" },
        { code: "NAKURU", name: "Nakuru Weighbridge", kind: "WEIGHBRIDGE", lat: "-0.303000", lng: "36.080000", country: "KE" },
      ],
    });

    // Stubbed last-known position for V-001 (telematics provider pending).
    await prisma.vehiclePosition.create({
      data: { vehicleId: vehicle.id, lat: "-6.638000", lng: "38.357000", source: "STUB", nearWaypoint: "CHALINZE", pingedAt: new Date(), speedKph: "62.00", headingDeg: 270 },
    });

    console.log("  Demo Phase 3: vehicle compliance + 4 driver docs, 5 waypoints, 1 stub position");
  } else {
    console.log("  Demo Phase 3: skipped (waypoints already exist)");
  }

  console.log("✅ Seed complete.\n  admin@fleetflow.local / admin1234\n  dispatcher@fleetflow.local / dispatch1234\n  finance@fleetflow.local / finance1234\n  driver@fleetflow.local / driver1234\n  staff@fleetflow.local / staff1234");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
