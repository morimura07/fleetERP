import { TableSkeleton, Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <TableSkeleton rows={6} cols={6} />
    </div>
  );
}
