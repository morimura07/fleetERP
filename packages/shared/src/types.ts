import type { RoleKey } from './roles.js';

/** Currencies in scope per SRS (multi-currency corridors). */
export type CurrencyCode = 'USD' | 'TZS' | 'KES' | 'UGX' | 'RWF' | 'ZMW';

export const CURRENCIES: CurrencyCode[] = ['USD', 'TZS', 'KES', 'UGX', 'RWF', 'ZMW'];

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: RoleKey;
  legalEntityId: string;
  legalEntityCode: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** Executive Control & Operations Dashboard payload — SRS §6. */
export interface DashboardKpis {
  fleet: {
    activeVehicles: number;
    totalVehicles: number;
    activeDrivers: number;
    totalDrivers: number;
    assetUtilizationRate: number; // %
  };
  commercial: {
    totalBookings: number;
    totalBookingsValueUsd: number;
    bookingsByStatus: { status: string; count: number }[];
  };
  financial: {
    invoicesIssuedUsd: number;
    paymentsReceivedUsd: number;
    cashAndBankUsd: number;
    supplierInvoicesUsd: number;
    supplierPaymentsUsd: number;
  };
  gauges: {
    customerRecovery: { receivedUsd: number; pendingUsd: number };
    supplierObligations: { paidUsd: number; outstandingUsd: number };
  };
  fuelEfficiency: { meets: number; below: number; missing: number };
  maintenance: { completed: number; upcoming: number; dueSoon: number; overdue: number };
  documentLifecycles: {
    category: string;
    current: number;
    toRenew: number;
    overdue: number;
  }[];
}
