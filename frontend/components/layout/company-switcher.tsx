"use client";
import { useEffect, useState } from "react";
import { Building, FlaskConical } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { apiFetch, getActiveCompany, setActiveCompany } from "@frontend/lib/fetcher";

type Company = { code: string; name: string; isSandbox?: boolean };

/**
 * ADMIN-only company switcher. Sets the "active company" (X-Data-Area) so the
 * admin's cross-entity view focuses on one tenant and new records land there.
 * "All companies" clears it. Only rendered for ADMIN (see Topbar).
 */
export function CompanySwitcher() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setActive(getActiveCompany());
    apiFetch<Company[]>("/api/lookups/companies").then(setCompanies).catch(() => {});
  }, []);

  function pick(code: string | null) {
    setActiveCompany(code);
    setActive(code);
    // Reload so Server Components re-fetch with the new active company.
    window.location.reload();
  }

  const label = active ?? "All companies";
  const activeIsSandbox = !!active && companies.find((c) => c.code === active)?.isSandbox;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors ${
          activeIsSandbox
            ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}>
          {activeIsSandbox ? <FlaskConical className="h-4 w-4" /> : <Building className="h-4 w-4" />}
          <span className="hidden font-medium sm:inline">{activeIsSandbox ? `${label} · Sandbox` : label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Active company</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => pick(null)} className={!active ? "font-semibold" : ""}>
          All companies
        </DropdownMenuItem>
        {companies.map((co) => (
          <DropdownMenuItem key={co.code} onClick={() => pick(co.code)} className={active === co.code ? "font-semibold" : ""}>
            <span className="font-mono text-xs">{co.code}</span>
            <span className="ml-2 truncate text-muted-foreground">{co.name}</span>
            {co.isSandbox && <FlaskConical className="ml-auto h-3.5 w-3.5 text-amber-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
