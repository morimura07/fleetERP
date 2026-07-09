"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@frontend/lib/utils";

/**
 * A collapsible section for long create/edit forms. Groups related fields under a
 * labelled, toggleable header so a form with many optional fields stays scannable.
 * Children render in a 2-column responsive grid (matching the forms' top grid).
 */
export function FormSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-elevated/50"
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-border p-3.5 md:grid-cols-2">
          {children}
        </div>
      )}
    </div>
  );
}
