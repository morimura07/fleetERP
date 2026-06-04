'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { moduleGroupsForRole } from '@fleeterp/shared';
import type { RoleKey } from '@fleeterp/shared';

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const Cmp = (Icons as Record<string, unknown>)[name] as
    | React.ComponentType<{ size?: number }>
    | undefined;
  const Fallback = Icons.Square;
  const C = Cmp ?? Fallback;
  return <C size={size} />;
}

export function Sidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname();
  const groups = moduleGroupsForRole(role);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Icons.Truck size={18} />
        </div>
        <span className="font-bold text-slate-900">FleetERP</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <Link
          href="/dashboard"
          className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            pathname === '/dashboard'
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Icons.LayoutDashboard size={16} />
          Executive Dashboard
        </Link>

        {groups.map((group) => (
          <div key={group.key} className="mb-3">
            <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {group.name}
            </p>
            {group.modules.map((m) => {
              const href = `/dashboard/${m.key}`;
              const active = pathname === href;
              return (
                <Link
                  key={m.key}
                  href={href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                    active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon name={m.icon} />
                  <span className="truncate">{m.name}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
