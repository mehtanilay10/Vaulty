import { Skeleton } from "@/components/ui/Skeleton";

export default function NotificationsLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-16" />
          <span className="text-text-muted">/</span>
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Push Notification Setup banner placeholder */}
      <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Notification items list */}
      <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4">
            <Skeleton className="h-7 w-7 rounded-md shrink-0" />
            <div className="flex-1 space-y-2 py-0.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-2 w-2 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
