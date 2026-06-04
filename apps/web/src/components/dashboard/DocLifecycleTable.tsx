import type { DashboardKpis } from '@fleeterp/shared';

/** Regulatory Document Lifecycles — SRS §6.3.5. */
export function DocLifecycleTable({ rows }: { rows: DashboardKpis['documentLifecycles'] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="pb-2">Category</th>
          <th className="pb-2 text-center">Current</th>
          <th className="pb-2 text-center">To Renew</th>
          <th className="pb-2 text-center">Overdue</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category} className="border-b border-slate-100 last:border-0">
            <td className="py-3 font-medium text-slate-700">{r.category}</td>
            <td className="py-3 text-center">
              <span className="inline-flex min-w-8 justify-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-600">
                {r.current}
              </span>
            </td>
            <td className="py-3 text-center">
              <span className="inline-flex min-w-8 justify-center rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-600">
                {r.toRenew}
              </span>
            </td>
            <td className="py-3 text-center">
              <span className="inline-flex min-w-8 justify-center rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">
                {r.overdue}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
