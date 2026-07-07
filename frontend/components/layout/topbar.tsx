"use client";
import { signOut } from "next-auth/react";
import { LogOut, Search, User as UserIcon, ScrollText } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@frontend/lib/labels";
import { NotificationBell } from "@frontend/components/layout/notification-bell";
import { ThemeToggle } from "@frontend/components/layout/theme-toggle";
import { CompanySwitcher } from "@frontend/components/layout/company-switcher";
import type { Role } from "@frontend/lib/enums";

export function Topbar({ name, role }: { name: string; role: Role }) {
  const initial = (name || "U").charAt(0).toUpperCase();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <div className="font-semibold md:hidden">FleetFlow</div>

      {/* Command-style search (visual; matches Avortyx) */}
      <div className="mx-auto hidden w-full max-w-xl items-center md:flex">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search orders, trips, accounts…"
            className="h-9 w-full rounded-lg border border-border bg-card/60 pl-9 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {role === "ADMIN" && <CompanySwitcher />}
        <ThemeToggle />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 items-center gap-2 rounded-lg border border-border pl-1 pr-2 transition-colors hover:bg-accent">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                {initial}
              </span>
              <span className="hidden text-left text-sm leading-tight sm:block">
                <span className="block font-medium">{name}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium">{name}</div>
              <div className="text-xs font-normal text-muted-foreground">{ROLE_LABEL[role]}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/users"><UserIcon className="mr-2 h-4 w-4" />Users</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/activity"><ScrollText className="mr-2 h-4 w-4" />Activity log</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
