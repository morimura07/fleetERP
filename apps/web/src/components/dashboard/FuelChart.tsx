'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

/** Vehicle fuel efficiency — SRS §6.2.3 (green/red/grey buckets). */
export function FuelChart({
  meets,
  below,
  missing,
}: {
  meets: number;
  below: number;
  missing: number;
}) {
  const data = [
    { name: 'Meets/Exceeds', value: meets, color: '#10b981' },
    { name: 'Below Expected', value: below, color: '#ef4444' },
    { name: 'Missing Data', value: missing, color: '#cbd5e1' },
  ];
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
