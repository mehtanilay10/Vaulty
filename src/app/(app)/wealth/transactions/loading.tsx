import { Skeleton } from "@/components/ui/Skeleton";

export default function WealthTransactionsLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-14" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-7 w-44" />
          </div>
        </div>
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      <div className="toolbar-surface p-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <Skeleton className="h-9 rounded-lg sm:col-span-6" />
          <Skeleton className="h-9 rounded-lg sm:col-span-3" />
          <Skeleton className="h-9 rounded-lg sm:col-span-3" />
        </div>
      </div>

      <div className="card divide-y divide-border-subtle overflow-hidden p-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
