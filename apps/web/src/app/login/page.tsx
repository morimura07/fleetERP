'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

const DEMO_ACCOUNTS = [
  { label: 'System Admin', email: 'admin@fleeterp.co.tz', password: 'Admin@2026' },
  { label: 'Operations', email: 'ops@fleeterp.co.tz', password: 'Ops@2026' },
  { label: 'Finance', email: 'finance@fleeterp.co.tz', password: 'Finance@2026' },
  { label: 'Workshop', email: 'workshop@fleeterp.co.tz', password: 'Workshop@2026' },
];

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@fleeterp.co.tz');
  const [password, setPassword] = useState('Admin@2026');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Truck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">FleetERP</h1>
            <p className="text-xs text-slate-500">Transport &amp; Logistics ERP</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <div className="mt-6">
          <p className="mb-2 text-center text-xs uppercase tracking-wide text-slate-400">
            Demo accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-600"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
