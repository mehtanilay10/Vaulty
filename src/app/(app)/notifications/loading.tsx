import { Skeleton } from "@/components/ui/Skeleton";

export default function NotificationsLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-16" />
          <span className="text-text-muted/50 text-xs">/</span>
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-40" />
        </div>
      </div>

      <Skeleton className="h-14 w-full rounded-xl" />

      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-7 w-28 rounded-lg" />
      </div>

      <div className="card divide-y divide-border-subtle overflow-hidden p-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3.5 px-4 py-3.5">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
