'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

/** Half-donut progress gauge — SRS §6.2 (Customer Recovery / Supplier Obligations). */
export function HalfDonut({
  positiveLabel,
  positiveValue,
  negativeLabel,
  negativeValue,
}: {
  positiveLabel: string;
  positiveValue: number;
  negativeLabel: string;
  negativeValue: number;
}) {
  const total = positiveValue + negativeValue;
  const pct = total > 0 ? Math.round((positiveValue / total) * 100) : 0;
  const data = [
    { name: positiveLabel, value: positiveValue, color: '#10b981' },
    { name: negativeLabel, value: negativeValue, color: '#ef4444' },
  ];
  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div>
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={total > 0 ? data : [{ name: 'none', value: 1, color: '#e2e8f0' }]}
              dataKey="value"
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={70}
              outerRadius={100}
              paddingAngle={1}
            >
              {(total > 0 ? data : [{ color: '#e2e8f0' }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <span className="text-3xl font-bold text-slate-900">{pct}%</span>
        </div>
      </div>
      <div className="mt-2 flex justify-around text-sm">
        <div className="text-center">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-500">{positiveLabel}</span>
          </div>
          <p className="font-semibold text-slate-800">{fmt(positiveValue)}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-slate-500">{negativeLabel}</span>
          </div>
          <p className="font-semibold text-slate-800">{fmt(negativeValue)}</p>
        </div>
      </div>
    </div>
  );
}
