import { Skeleton } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-16" />
          <span className="text-text-muted/50 text-xs">/</span>
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden xl:block">
          <div className="card space-y-1.5 p-2.5">
            <Skeleton className="mx-2 my-1.5 h-3 w-28" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>

        <div className="max-w-4xl space-y-5">
          <div className="card space-y-4 p-5">
            <Skeleton className="h-5 w-36" />
            <div className="flex items-center gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
          </div>

          <div className="card space-y-4 p-5">
            <Skeleton className="h-5 w-44" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
