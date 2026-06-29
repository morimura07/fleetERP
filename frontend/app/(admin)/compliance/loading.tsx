import { TableSkeleton, Skeleton } from "@frontend/components/ui/loader";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <TableSkeleton rows={6} cols={5} />
    </div>
  );
}
