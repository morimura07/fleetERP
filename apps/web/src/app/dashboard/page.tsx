'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DashboardKpis } from '@fleeterp/shared';
import { apiFetch } from '@/lib/api';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Card } from '@/components/dashboard/Card';
import { HalfDonut } from '@/components/dashboard/HalfDonut';
import { FuelChart } from '@/components/dashboard/FuelChart';
import { MaintenanceArc } from '@/components/dashboard/MaintenanceArc';
import { DocLifecycleTable } from '@/components/dashboard/DocLifecycleTable';

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

const STATUS_LABELS: Record<string, string> = {
  PENDING_INVOICE: 'Pending Invoice',
  INVOICE_CREATED: 'Invoice Created',
  PAYMENT_RECEIVED: 'Payment Received',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardKpis>('/dashboard/kpis')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-700">Failed to load dashboard: {error}</div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Executive Control &amp; Operations</h1>
        <p className="text-sm text-slate-500">
          Real-time view across fleet, commercial pipeline, finance and compliance.
        </p>
      </div>

      {/* Section 1: KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active Vehicles"
          value={`${data.fleet.activeVehicles} / ${data.fleet.totalVehicles}`}
          sub={`${data.fleet.assetUtilizationRate}% asset utilization`}
          icon="Truck"
          accent="brand"
        />
        <KpiCard
          label="Active Drivers"
          value={`${data.fleet.activeDrivers} / ${data.fleet.totalDrivers}`}
          sub="Dispatched vs. on rest"
          icon="Users"
          accent="slate"
        />
        <KpiCard
          label="Total Bookings"
          value={`${data.commercial.totalBookings}`}
          sub={`${usd(data.commercial.totalBookingsValueUsd)} pipeline value`}
          icon="Package"
          accent="green"
        />
        <KpiCard
          label="Cash &amp; Bank"
          value={usd(data.financial.cashAndBankUsd)}
          sub="Aggregated across entities"
          icon="Landmark"
          accent="brand"
        />
        <KpiCard
          label="Invoices Issued"
          value={usd(data.financial.invoicesIssuedUsd)}
          sub={`${usd(data.financial.paymentsReceivedUsd)} received`}
          icon="HandCoins"
          accent="green"
        />
        <KpiCard
          label="Payments Received"
          value={usd(data.financial.paymentsReceivedUsd)}
          sub="Cleared at bank"
          icon="CheckCircle2"
          accent="green"
        />
        <KpiCard
          label="Supplier Invoices"
          value={usd(data.financial.supplierInvoicesUsd)}
          sub={`${usd(data.financial.supplierPaymentsUsd)} paid`}
          icon="ReceiptText"
          accent="amber"
        />
        <KpiCard
          label="Supplier Outstanding"
          value={usd(data.gauges.supplierObligations.outstandingUsd)}
          sub="Bills requiring clearance"
          icon="AlertTriangle"
          accent="red"
        />
      </div>

      {/* Section 2: gauges & fuel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Customer Payments Recovery" subtitle="Received vs. pending under collections">
          <HalfDonut
            positiveLabel="Received"
            positiveValue={data.gauges.customerRecovery.receivedUsd}
            negativeLabel="Pending"
            negativeValue={data.gauges.customerRecovery.pendingUsd}
          />
        </Card>
        <Card title="Supplier &amp; Vendor Obligations" subtitle="Paid vs. outstanding">
          <HalfDonut
            positiveLabel="Paid"
            positiveValue={data.gauges.supplierObligations.paidUsd}
            negativeLabel="Not Paid"
            negativeValue={data.gauges.supplierObligations.outstandingUsd}
          />
        </Card>
        <Card title="Fleet Fuel Efficiency" subtitle="KM per litre vs. target">
          <FuelChart
            meets={data.fuelEfficiency.meets}
            below={data.fuelEfficiency.below}
            missing={data.fuelEfficiency.missing}
          />
        </Card>
      </div>

      {/* Section 3: compliance & lifecycle */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Vehicle Maintenance &amp; Workshop">
          <MaintenanceArc
            completed={data.maintenance.completed}
            upcoming={data.maintenance.upcoming}
            dueSoon={data.maintenance.dueSoon}
            overdue={data.maintenance.overdue}
          />
        </Card>
        <Card title="Bookings by Status" subtitle="Commercial pipeline">
          <div className="space-y-3 pt-2">
            {data.commercial.bookingsByStatus.map((s) => {
              const max = Math.max(...data.commercial.bookingsByStatus.map((x) => x.count), 1);
              return (
                <div key={s.status}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-600">{STATUS_LABELS[s.status] ?? s.status}</span>
                    <span className="font-semibold text-slate-800">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-brand-500"
                      style={{ width: `${(s.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Regulatory Document Lifecycles" subtitle="Avoid border impoundment">
          <DocLifecycleTable rows={data.documentLifecycles} />
        </Card>
      </div>
    </div>
  );
}
