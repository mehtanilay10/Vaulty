import { Skeleton } from "@/components/ui/Skeleton";

export default function RemindersLoading() {
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
            <Skeleton className="h-6 w-36" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg shrink-0" />
        ))}
      </div>

      {/* Reminder cards list */}
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex items-start gap-3.5 p-4">
            <Skeleton className="h-5 w-5 rounded-full shrink-0 mt-1" />
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
              <Skeleton className="h-3 w-64 max-w-full" />
              <div className="flex gap-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
