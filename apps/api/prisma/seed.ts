import { PrismaClient, VehicleStatus, DriverStatus, BookingStatus, InvoiceStatus, SupplierInvoiceStatus, MaintenanceStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  console.log('Seeding FleetERP…');

  // --- Reset (idempotent dev seed) ---
  await prisma.maintenanceRecord.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.supplierInvoice.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.legalEntity.deleteMany();

  // --- Legal entities (Module 34 / Data_Area_ID) ---
  const hq = await prisma.legalEntity.create({
    data: { code: 'HQ01', name: 'TransLogistics Holdings', countryRegion: 'TZA', currency: 'USD', isHeadquarter: true },
  });
  const tz = await prisma.legalEntity.create({
    data: { code: 'TZ01', name: 'TransLogistics Tanzania Ltd', countryRegion: 'TZA', currency: 'TZS' },
  });
  const ke = await prisma.legalEntity.create({
    data: { code: 'KE01', name: 'TransLogistics Kenya Ltd', countryRegion: 'KEN', currency: 'KES' },
  });

  // --- Roles (§4.1) ---
  const roleDefs = [
    { key: 'SYSTEM_ADMIN', name: 'System Administrator' },
    { key: 'OPERATIONS_PLANNER', name: 'Operations Planner' },
    { key: 'FINANCE_CONTROLLER', name: 'Finance Controller' },
    { key: 'WORKSHOP_MANAGER', name: 'Workshop Manager' },
  ];
  const roles: Record<string, string> = {};
  for (const r of roleDefs) {
    const created = await prisma.role.create({ data: r });
    roles[r.key] = created.id;
  }

  // --- Users ---
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  await prisma.user.createMany({
    data: [
      { email: 'admin@fleeterp.co.tz', displayName: 'System Admin', passwordHash: hash('Admin@2026'), roleId: roles.SYSTEM_ADMIN, legalEntityId: hq.id },
      { email: 'ops@fleeterp.co.tz', displayName: 'Operations Planner', passwordHash: hash('Ops@2026'), roleId: roles.OPERATIONS_PLANNER, legalEntityId: tz.id },
      { email: 'finance@fleeterp.co.tz', displayName: 'Finance Controller', passwordHash: hash('Finance@2026'), roleId: roles.FINANCE_CONTROLLER, legalEntityId: tz.id },
      { email: 'workshop@fleeterp.co.tz', displayName: 'Workshop Manager', passwordHash: hash('Workshop@2026'), roleId: roles.WORKSHOP_MANAGER, legalEntityId: tz.id },
    ],
  });

  // --- Vehicles (Module 11) with varied fuel + document expiries ---
  const vehicleSeed = [
    { assetId: 'VH-001', licensePlate: 'T888 ABC', makeModel: 'Scania R480', status: VehicleStatus.ACTIVE, target: 2.8, actual: 3.0, ins: 120, transit: 90, gov: 10, axle: -5 },
    { assetId: 'VH-002', licensePlate: 'T889 DEF', makeModel: 'Volvo FH12', status: VehicleStatus.ACTIVE, target: 2.6, actual: 2.1, ins: 45, transit: 200, gov: 25, axle: 300 },
    { assetId: 'VH-003', licensePlate: 'T890 GHI', makeModel: 'Shacman X3000', status: VehicleStatus.ACTIVE, target: 2.5, actual: null, ins: 8, transit: 150, gov: 60, axle: 80 },
    { assetId: 'VH-004', licensePlate: 'KAA 111A', makeModel: 'Scania R450', status: VehicleStatus.PARKED, target: 2.7, actual: 2.9, ins: 220, transit: 12, gov: 100, axle: 100 },
    { assetId: 'VH-005', licensePlate: 'KAB 222B', makeModel: 'Volvo FH16', status: VehicleStatus.MAINTENANCE, target: 2.4, actual: 1.8, ins: -10, transit: 70, gov: 40, axle: 20 },
    { assetId: 'VH-006', licensePlate: 'T901 JKL', makeModel: 'Scania R500', status: VehicleStatus.ACTIVE, target: 2.9, actual: 3.1, ins: 300, transit: 28, gov: 200, axle: 250 },
    { assetId: 'VH-007', licensePlate: 'T902 MNO', makeModel: 'MAN TGX', status: VehicleStatus.ACTIVE, target: 2.6, actual: null, ins: 5, transit: 5, gov: 5, axle: 5 },
    { assetId: 'VH-008', licensePlate: 'KAC 333C', makeModel: 'Isuzu FVR', status: VehicleStatus.PARKED, target: 3.2, actual: 3.4, ins: 180, transit: 180, gov: 180, axle: 180 },
  ];
  const vehicleIds: string[] = [];
  for (const v of vehicleSeed) {
    const isKe = v.licensePlate.startsWith('K');
    const created = await prisma.vehicle.create({
      data: {
        assetId: v.assetId,
        licensePlate: v.licensePlate,
        makeModel: v.makeModel,
        status: v.status,
        targetKmPerLiter: v.target,
        actualKmPerLiter: v.actual,
        insuranceExpiry: days(v.ins),
        transitLicenseExpiry: days(v.transit),
        speedGovernorExpiry: days(v.gov),
        axleLoadCertExpiry: days(v.axle),
        legalEntityId: isKe ? ke.id : tz.id,
      },
    });
    vehicleIds.push(created.id);
  }

  // --- Drivers (Module 11.2) ---
  const driverSeed = [
    { driverId: 'DR-001', name: 'Juma Hassan', status: DriverStatus.ACTIVE, lic: 200, pass: 400, comesa: 15, yf: true },
    { driverId: 'DR-002', name: 'Peter Mwangi', status: DriverStatus.ACTIVE, lic: 20, pass: 365, comesa: 90, yf: true },
    { driverId: 'DR-003', name: 'Emanuel Kato', status: DriverStatus.REST, lic: -3, pass: 120, comesa: 200, yf: false },
    { driverId: 'DR-004', name: 'Samuel Otieno', status: DriverStatus.ACTIVE, lic: 150, pass: 25, comesa: 300, yf: true },
    { driverId: 'DR-005', name: 'Joseph Mushi', status: DriverStatus.REST, lic: 90, pass: 90, comesa: -10, yf: true },
  ];
  for (const d of driverSeed) {
    const isKe = d.name.includes('Mwangi') || d.name.includes('Otieno');
    await prisma.driver.create({
      data: {
        driverId: d.driverId,
        name: d.name,
        status: d.status,
        licenseExpiry: days(d.lic),
        passportExpiry: days(d.pass),
        comesaPermitExpiry: days(d.comesa),
        yellowFeverValid: d.yf,
        legalEntityId: isKe ? ke.id : tz.id,
      },
    });
  }

  // --- Bookings (Module 12) ---
  const bookingSeed = [
    { loadId: 'LD-1001', customer: 'Bakhresa Group', corridor: 'Central_Corridor', origin: 'Dar es Salaam Port', dest: 'Kigali Depot', value: 8200, status: BookingStatus.PAYMENT_RECEIVED, v: 0 },
    { loadId: 'LD-1002', customer: 'Bidco Africa', corridor: 'Northern_Corridor', origin: 'Mombasa Port', dest: 'Kampala Hub', value: 9400, status: BookingStatus.INVOICE_CREATED, v: 1 },
    { loadId: 'LD-1003', customer: 'Tanga Cement', corridor: 'Central_Corridor', origin: 'Dar es Salaam', dest: 'Lusaka', value: 11200, status: BookingStatus.PENDING_INVOICE, v: 2 },
    { loadId: 'LD-1004', customer: 'Unilever EA', corridor: 'Northern_Corridor', origin: 'Mombasa', dest: 'Nairobi', value: 5400, status: BookingStatus.PAYMENT_RECEIVED, v: 5 },
    { loadId: 'LD-1005', customer: 'Dangote Cement', corridor: 'Central_Corridor', origin: 'Dar es Salaam', dest: 'Lubumbashi', value: 14800, status: BookingStatus.PENDING_INVOICE, v: 6 },
    { loadId: 'LD-1006', customer: 'Coca-Cola Kwanza', corridor: 'Central_Corridor', origin: 'Dar es Salaam', dest: 'Mwanza', value: 4300, status: BookingStatus.INVOICE_CREATED, v: 0 },
  ];
  for (const b of bookingSeed) {
    await prisma.booking.create({
      data: {
        loadId: b.loadId,
        customerName: b.customer,
        corridor: b.corridor,
        originZone: b.origin,
        destZone: b.dest,
        valueUsd: b.value,
        status: b.status,
        vehicleId: vehicleIds[b.v],
        legalEntityId: tz.id,
      },
    });
  }

  // --- AR Invoices (Module 2) ---
  await prisma.invoice.createMany({
    data: [
      { invoiceId: 'AR-CST-0001', customerName: 'Bakhresa Group', amountUsd: 8200, paidUsd: 8200, status: InvoiceStatus.PAID, legalEntityId: tz.id },
      { invoiceId: 'AR-CST-0002', customerName: 'Bidco Africa', amountUsd: 9400, paidUsd: 4000, status: InvoiceStatus.ISSUED, legalEntityId: tz.id },
      { invoiceId: 'AR-CST-0003', customerName: 'Unilever EA', amountUsd: 5400, paidUsd: 5400, status: InvoiceStatus.PAID, legalEntityId: ke.id },
      { invoiceId: 'AR-CST-0004', customerName: 'Coca-Cola Kwanza', amountUsd: 4300, paidUsd: 0, status: InvoiceStatus.ISSUED, legalEntityId: tz.id },
      { invoiceId: 'AR-CST-0005', customerName: 'Tanga Cement', amountUsd: 6700, paidUsd: 2000, status: InvoiceStatus.ISSUED, legalEntityId: tz.id },
    ],
  });

  // --- AP Supplier Invoices (Module 1) ---
  await prisma.supplierInvoice.createMany({
    data: [
      { invoiceNumber: 'AP-VND-0001', vendorName: 'Oryx Energies (Fuel)', amountUsd: 12000, paidUsd: 12000, status: SupplierInvoiceStatus.PAID, legalEntityId: tz.id },
      { invoiceNumber: 'AP-VND-0002', vendorName: 'Scania Spare Parts', amountUsd: 6400, paidUsd: 2000, status: SupplierInvoiceStatus.OUTSTANDING, legalEntityId: tz.id },
      { invoiceNumber: 'AP-VND-0003', vendorName: 'Dar Port Clearing Agent', amountUsd: 3800, paidUsd: 0, status: SupplierInvoiceStatus.OUTSTANDING, legalEntityId: tz.id },
      { invoiceNumber: 'AP-VND-0004', vendorName: 'Total Kenya (Fuel)', amountUsd: 9100, paidUsd: 9100, status: SupplierInvoiceStatus.PAID, legalEntityId: ke.id },
    ],
  });

  // --- Bank accounts (Module 4) ---
  await prisma.bankAccount.createMany({
    data: [
      { bankName: 'CRDB', accountNo: '0150-DAR-001', currency: 'TZS', balanceUsd: 48000, legalEntityId: tz.id },
      { bankName: 'Stanbic', accountNo: 'USD-DAR-002', currency: 'USD', balanceUsd: 132000, legalEntityId: tz.id },
      { bankName: 'KCB', accountNo: 'KES-MSA-001', currency: 'KES', balanceUsd: 57000, legalEntityId: ke.id },
    ],
  });

  // --- Maintenance records (Module 19.2) ---
  const maintStatuses = [
    MaintenanceStatus.COMPLETED,
    MaintenanceStatus.COMPLETED,
    MaintenanceStatus.UPCOMING,
    MaintenanceStatus.DUE_SOON,
    MaintenanceStatus.OVERDUE,
    MaintenanceStatus.UPCOMING,
    MaintenanceStatus.OVERDUE,
    MaintenanceStatus.COMPLETED,
  ];
  for (let i = 0; i < vehicleIds.length; i++) {
    await prisma.maintenanceRecord.create({
      data: {
        vehicleId: vehicleIds[i],
        status: maintStatuses[i],
        lastInspectionDate: days(-30 - i * 5),
        nextInspectionDate: days(30 - i * 12),
        costAccumulatedUsd: 500 + i * 220,
      },
    });
  }

  console.log('Seed complete. Logins:');
  console.log('  admin@fleeterp.co.tz / Admin@2026      (System Admin, HQ)');
  console.log('  ops@fleeterp.co.tz / Ops@2026          (Operations Planner, TZ01)');
  console.log('  finance@fleeterp.co.tz / Finance@2026  (Finance Controller, TZ01)');
  console.log('  workshop@fleeterp.co.tz / Workshop@2026 (Workshop Manager, TZ01)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
