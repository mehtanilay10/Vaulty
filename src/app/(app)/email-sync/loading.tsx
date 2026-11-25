import { Skeleton } from "@/components/ui/Skeleton";

export default function EmailSyncLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-10" />
          <span className="text-text-muted">/</span>
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
      </div>

      {/* Provider inboxes section */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card space-y-4 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="flex justify-end border-t border-border-subtle pt-3.5">
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 StatCards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-4 p-4.5">
            <div className="flex items-start justify-between">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs skeleton */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-3 border-b border-border-subtle pb-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>

        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex items-center gap-3 p-4">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-44 rounded-lg shrink-0" />
              <Skeleton className="h-5 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
