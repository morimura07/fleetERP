'use client';

import { use } from 'react';
import { Construction } from 'lucide-react';
import { ALL_MODULES } from '@fleeterp/shared';

export default function ModulePlaceholder({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = use(params);
  const def = ALL_MODULES.find((m) => m.key === module);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
          <Construction size={24} />
        </div>
        <h1 className="text-xl font-semibold text-slate-800">
          {def ? def.name : 'Unknown module'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {def
            ? `Module ${def.id} is scaffolded in the navigation and access model. Its screens are planned for a later phase.`
            : 'This module is not part of the FleetERP registry.'}
        </p>
      </div>
    </div>
  );
}
