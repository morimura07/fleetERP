"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Truck, Building2, Package,
  CalendarClock, FileText, Wallet, ScrollText, Settings,
  ClipboardList, Route, BookOpen, BookText,
  ReceiptText, HandCoins, Store, Contact,
  Percent, AlarmClock,
  Landmark, PiggyBank, Combine, Coins,
  ShieldCheck, MapPin, Boxes,
} from "lucide-react";
import { cn } from "@frontend/lib/utils";
import { can, type Permission, type Role } from "@frontend/lib/rbac";

type NavItem = { href: string; label: string; icon: typeof Users; perm: Permission };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard:view" }],
  },
  {
    label: "Operations",
    items: [
      { href: "/orders", label: "Orders", icon: ClipboardList, perm: "order:read" },
      { href: "/trips", label: "Trips", icon: Route, perm: "trip:read" },
      { href: "/jobs", label: "Delivery Jobs", icon: Package, perm: "job:read" },
      { href: "/dispatch", label: "Dispatch", icon: CalendarClock, perm: "dispatch:read" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/accounts", label: "Chart of Accounts", icon: BookOpen, perm: "account:read" },
      { href: "/ledger", label: "Journal", icon: BookText, perm: "ledger:read" },
      { href: "/vendors", label: "Vendors", icon: Store, perm: "vendor:read" },
      { href: "/payables", label: "Payables (AP)", icon: ReceiptText, perm: "payable:read" },
      { href: "/customers", label: "Customers", icon: Contact, perm: "customer:read" },
      { href: "/receivables", label: "Receivables (AR)", icon: HandCoins, perm: "receivable:read" },
      { href: "/collections", label: "Collections", icon: AlarmClock, perm: "collection:read" },
      { href: "/bank", label: "Cash & Bank", icon: Landmark, perm: "bank:read" },
      { href: "/budgets", label: "Budgets", icon: PiggyBank, perm: "budget:read" },
      { href: "/tax", label: "Tax", icon: Percent, perm: "tax:read" },
      { href: "/fx", label: "Exchange Rates", icon: Coins, perm: "fx:read" },
      { href: "/consolidation", label: "Consolidation", icon: Combine, perm: "consolidation:read" },
      { href: "/payments", label: "Payments", icon: Wallet, perm: "payment:read" },
    ],
  },
  {
    label: "Fleet & People",
    items: [
      { href: "/drivers", label: "Drivers", icon: Users, perm: "driver:read" },
      { href: "/vehicles", label: "Vehicles", icon: Truck, perm: "vehicle:read" },
      { href: "/clients", label: "Clients", icon: Building2, perm: "client:read" },
      { href: "/inventory", label: "Inventory", icon: Boxes, perm: "inventory:read" },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck, perm: "compliance:read" },
      { href: "/waypoints", label: "GPS Waypoints", icon: MapPin, perm: "waypoint:read" },
      { href: "/reports", label: "Daily Reports", icon: FileText, perm: "report:read" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/activity", label: "Activity Log", icon: ScrollText, perm: "activity:read" },
      { href: "/users", label: "Users", icon: Settings, perm: "user:manage" },
    ],
  },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-xl md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30">
          F
        </span>
        <span className="text-lg font-bold tracking-tight">FleetFlow</span>
      </div>

      <nav className="scroll-slim flex-1 overflow-y-auto px-3 py-4">
        {GROUPS.map((group) => {
          const items = group.items.filter((n) => can(role, n.perm));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                        active
                          ? "bg-gradient-to-r from-primary/20 to-primary/5 text-foreground"
                          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                      )}
                      <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live
          </span>
          <span className="font-mono">v1.0</span>
        </div>
      </div>
    </aside>
  );
}
