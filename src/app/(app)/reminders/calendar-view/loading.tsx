import { Skeleton } from "@/components/ui/Skeleton";

export default function RemindersCalendarLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-20" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-7 w-40" />
            </div>
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-7 gap-2 border-b border-border-subtle bg-surface-muted/60 px-2 py-2.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="mx-auto h-3 w-8" />
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y divide-border-subtle">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[100px] space-y-2 p-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              {i % 4 === 0 && <Skeleton className="h-4 w-full rounded" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
