import type { ReactNode } from "react";

/**
 * Standard page header — large title, muted one-line subtitle, optional
 * right-aligned action. Matches the Avortyx page-header pattern.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
