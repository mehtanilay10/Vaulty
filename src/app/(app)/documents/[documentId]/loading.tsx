import { Skeleton } from "@/components/ui/Skeleton";

export default function DocumentDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-20" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-7 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      {/* AI Analysis panel */}
      <div className="card flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* Viewer & AI Tabs */}
      <div className="card overflow-hidden p-0">
        <div className="flex gap-4 border-b border-border-subtle px-5 py-3">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-6 w-28 rounded" />
          <Skeleton className="h-6 w-16 rounded" />
        </div>
        <div className="p-4 sm:p-5">
          <Skeleton className="h-[68vh] min-h-[520px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
