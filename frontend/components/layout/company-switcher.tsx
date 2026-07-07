"use client";
import { useEffect, useState } from "react";
import { Building } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { apiFetch, getActiveCompany, setActiveCompany } from "@frontend/lib/fetcher";

type Company = { code: string; name: string };

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-9 items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Building className="h-4 w-4" />
          <span className="hidden font-medium sm:inline">{label}</span>
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
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
