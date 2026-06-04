'use client';

import { LogOut, Building2 } from 'lucide-react';
import { ROLE_LABELS } from '@fleeterp/shared';
import { useAuth } from '@/providers/AuthProvider';

export function Topbar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Building2 size={16} />
        <span className="font-medium text-slate-700">{user.legalEntityCode}</span>
        <span className="text-slate-300">·</span>
        <span>{ROLE_LABELS[user.role]}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-800">{user.displayName}</p>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
          {user.displayName.charAt(0)}
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-red-600"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
