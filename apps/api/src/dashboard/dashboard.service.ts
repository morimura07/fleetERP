import { Injectable } from '@nestjs/common';
import { ROLES, type AuthUser, type DashboardKpis } from '@fleeterp/shared';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;

/** Classify a document expiry date into a dashboard lifecycle bucket (SRS §6.3). */
function bucketExpiry(
  date: Date | null | undefined,
  now: number,
): 'current' | 'toRenew' | 'overdue' | null {
  if (!date) return null;
  const diff = date.getTime() - now;
  if (diff < 0) return 'overdue';
  if (diff <= 30 * DAY) return 'toRenew';
  return 'current';
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Non-admins are scoped to their own legal entity; admins see the whole group. */
  private scope(user: AuthUser) {
    return user.role === ROLES.SYSTEM_ADMIN ? {} : { legalEntityId: user.legalEntityId };
  }

  async getKpis(user: AuthUser): Promise<DashboardKpis> {
    const where = this.scope(user);
    const now = Date.now();

    const [
      totalVehicles,
      activeVehicles,
      totalDrivers,
      activeDrivers,
      vehicles,
      bookings,
      invoices,
      supplierInvoices,
      bankAccounts,
      maintenance,
      drivers,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.driver.count({ where }),
      this.prisma.driver.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.vehicle.findMany({ where }),
      this.prisma.booking.findMany({ where }),
      this.prisma.invoice.findMany({ where }),
      this.prisma.supplierInvoice.findMany({ where }),
      this.prisma.bankAccount.findMany({ where }),
      this.prisma.maintenanceRecord.findMany({
        where: where.legalEntityId ? { vehicle: where } : {},
      }),
      this.prisma.driver.findMany({ where }),
    ]);

    // Commercial pipeline
    const bookingsValueUsd = bookings.reduce((s, b) => s + b.valueUsd, 0);
    const statusCounts = bookings.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] ?? 0) + 1;
      return acc;
    }, {});

    // Financial controls
    const invoicesIssuedUsd = invoices.reduce((s, i) => s + i.amountUsd, 0);
    const paymentsReceivedUsd = invoices.reduce((s, i) => s + i.paidUsd, 0);
    const supplierInvoicesUsd = supplierInvoices.reduce((s, i) => s + i.amountUsd, 0);
    const supplierPaymentsUsd = supplierInvoices.reduce((s, i) => s + i.paidUsd, 0);
    const cashAndBankUsd = bankAccounts.reduce((s, b) => s + b.balanceUsd, 0);

    // Fuel efficiency buckets
    const fuel = { meets: 0, below: 0, missing: 0 };
    for (const v of vehicles) {
      if (v.actualKmPerLiter == null) fuel.missing++;
      else if (v.actualKmPerLiter >= v.targetKmPerLiter) fuel.meets++;
      else fuel.below++;
    }

    // Maintenance arc
    const maint = { completed: 0, upcoming: 0, dueSoon: 0, overdue: 0 };
    for (const m of maintenance) {
      if (m.status === 'COMPLETED') maint.completed++;
      else if (m.status === 'UPCOMING') maint.upcoming++;
      else if (m.status === 'DUE_SOON') maint.dueSoon++;
      else if (m.status === 'OVERDUE') maint.overdue++;
    }

    // Document lifecycles
    const vehDocs = { current: 0, toRenew: 0, overdue: 0 };
    for (const v of vehicles) {
      for (const d of [
        v.insuranceExpiry,
        v.transitLicenseExpiry,
        v.speedGovernorExpiry,
        v.axleLoadCertExpiry,
      ]) {
        const b = bucketExpiry(d, now);
        if (b) vehDocs[b]++;
      }
    }
    const empDocs = { current: 0, toRenew: 0, overdue: 0 };
    for (const dr of drivers) {
      for (const d of [dr.licenseExpiry, dr.passportExpiry, dr.comesaPermitExpiry]) {
        const b = bucketExpiry(d, now);
        if (b) empDocs[b]++;
      }
      if (!dr.yellowFeverValid) empDocs.overdue++;
    }

    return {
      fleet: {
        activeVehicles,
        totalVehicles,
        activeDrivers,
        totalDrivers,
        assetUtilizationRate:
          totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0,
      },
      commercial: {
        totalBookings: bookings.length,
        totalBookingsValueUsd: bookingsValueUsd,
        bookingsByStatus: [
          { status: 'PENDING_INVOICE', count: statusCounts.PENDING_INVOICE ?? 0 },
          { status: 'INVOICE_CREATED', count: statusCounts.INVOICE_CREATED ?? 0 },
          { status: 'PAYMENT_RECEIVED', count: statusCounts.PAYMENT_RECEIVED ?? 0 },
        ],
      },
      financial: {
        invoicesIssuedUsd,
        paymentsReceivedUsd,
        cashAndBankUsd,
        supplierInvoicesUsd,
        supplierPaymentsUsd,
      },
      gauges: {
        customerRecovery: {
          receivedUsd: paymentsReceivedUsd,
          pendingUsd: Math.max(invoicesIssuedUsd - paymentsReceivedUsd, 0),
        },
        supplierObligations: {
          paidUsd: supplierPaymentsUsd,
          outstandingUsd: Math.max(supplierInvoicesUsd - supplierPaymentsUsd, 0),
        },
      },
      fuelEfficiency: fuel,
      maintenance: maint,
      documentLifecycles: [
        {
          category: 'Vehicle Documents',
          current: vehDocs.current,
          toRenew: vehDocs.toRenew,
          overdue: vehDocs.overdue,
        },
        {
          category: 'Employee Documents',
          current: empDocs.current,
          toRenew: empDocs.toRenew,
          overdue: empDocs.overdue,
        },
      ],
    };
  }
}
