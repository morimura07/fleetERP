"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@frontend/components/ui/dropdown-menu";
import { Button } from "@frontend/components/ui/button";
import { apiFetch } from "@frontend/lib/fetcher";

interface Notification {
  id: string; title: string; body: string; isRead: boolean; createdAt: string; link?: string | null;
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const data = await apiFetch<{ items: Notification[]; unread: number }>("/api/notifications");
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function markAllRead() {
    await apiFetch("/api/notifications", { method: "PATCH", body: JSON.stringify({}) }).catch(() => {});
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-9 w-9" onClick={() => unread && markAllRead()}>
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {items.length === 0 && <div className="px-2 py-4 text-center text-sm text-muted-foreground">All caught up</div>}
        {items.slice(0, 10).map((n) => (
          <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">{n.title}</span>
            <span className="text-xs text-muted-foreground">{n.body}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
