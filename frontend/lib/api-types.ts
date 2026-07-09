/**
 * Response shapes returned by the backend API, mirrored for the frontend.
 *
 * The backend owns the authoritative types (its service layer); these copies let
 * Server Components type their `serverApi<T>()` reads without importing backend
 * code. Keep them in sync with backend/src/services.
 */

export interface DashboardStats {
  todayJobs: number;
  delivering: number;
  completedToday: number;
  activeDrivers: number;
  availableVehicles: number;
  revenueThisMonth: number;
  monthlySeries: { month: string; revenue: number; jobs: number }[];
}

export interface ExecutiveStats {
  activeVehicles: number;
  totalFleet: number;
  activeDrivers: number;
  totalDrivers: number;
  assetUtilizationPct: number;
  totalBookings: number;
  totalBookingValue: string;
  invoicedRevenue: string;
  tripProfit: string;
  currency: string;
  customerRecovery: { invoiced: string; pending: string };
  supplierObligations: { posted: string; unposted: string };
  compliance: { current: number; expiringSoon: number; expired: number };
}

export interface KpiTile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  href?: string;
  hint?: string;
}
export interface KpiCategory {
  key: string;
  title: string;
  tiles: KpiTile[];
}
export interface KpiDashboard {
  asOf: string;
  currency: string;
  categories: KpiCategory[];
}

export interface AgingCustomerRow {
  customerId: string;
  customerName: string;
  customerCode: string;
  currency: string;
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  total: string;
}

export interface AgingReport {
  asOf: string;
  totals: {
    current: string;
    d1_30: string;
    d31_60: string;
    d61_90: string;
    d90_plus: string;
    total: string;
  };
  customers: AgingCustomerRow[];
}
