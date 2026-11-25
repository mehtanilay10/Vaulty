import { Skeleton } from "@/components/ui/Skeleton";

export default function FamilyLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-10" />
          <span className="text-text-muted">/</span>
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-6 w-28" />
          </div>
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* 3 StatCards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-4 p-4.5">
            <div className="flex items-start justify-between">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>

      {/* Section: Shared by you */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-36" />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card space-y-4 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>

              <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-muted/40 p-3">
                <Skeleton className="h-2.5 w-16" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-24 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-20 rounded-md" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
