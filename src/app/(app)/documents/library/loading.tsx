import { Skeleton } from "@/components/ui/Skeleton";

export default function DocumentsLibraryLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-20" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-7 w-40" />
          </div>
        </div>
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      {/* Filter toolbar */}
      <div className="toolbar-surface p-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-full rounded-lg sm:w-52" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-28" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-36" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-36" />
          </div>
        </div>
      </div>

      {/* 8 Document cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card flex flex-col justify-between space-y-4 p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <div className="flex justify-between border-t border-border-subtle pt-2.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
