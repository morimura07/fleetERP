'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

/** Vehicle maintenance & workshop status — SRS §6.3.4 multi-segment arc. */
export function MaintenanceArc({
  completed,
  upcoming,
  dueSoon,
  overdue,
}: {
  completed: number;
  upcoming: number;
  dueSoon: number;
  overdue: number;
}) {
  const data = [
    { name: 'Completed', value: completed, color: '#10b981' },
    { name: 'Upcoming', value: upcoming, color: '#3b82f6' },
    { name: 'Due Soon', value: dueSoon, color: '#f59e0b' },
    { name: 'Overdue', value: overdue, color: '#ef4444' },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? data : [{ name: 'none', value: 1, color: '#e2e8f0' }]}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={2}
          >
            {(total > 0 ? data : [{ color: '#e2e8f0' }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => <span className="text-slate-500">{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
