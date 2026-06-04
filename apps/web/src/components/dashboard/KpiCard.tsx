import * as Icons from 'lucide-react';

export function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = 'brand',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  accent?: 'brand' | 'green' | 'amber' | 'red' | 'slate';
}) {
  const accents: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  const Cmp =
    ((Icons as Record<string, unknown>)[icon] as React.ComponentType<{ size?: number }>) ??
    Icons.Square;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accents[accent]}`}>
          <Cmp size={20} />
        </div>
      </div>
    </div>
  );
}
