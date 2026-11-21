import { Skeleton } from "@/components/ui/Skeleton";

export default function DocumentDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-10" />
        <span className="text-text-muted">/</span>
        <Skeleton className="h-3 w-16" />
        <span className="text-text-muted">/</span>
        <Skeleton className="h-3 w-28" />
        <span className="text-text-muted">/</span>
        <Skeleton className="h-3 w-36" />
      </div>

      {/* Document Header & Actions */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center border-b border-border-subtle pb-5">
        <div className="space-y-2.5 min-w-0">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-6 w-52 sm:w-80" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-28" />
            <span className="text-text-muted">•</span>
            <Skeleton className="h-3 w-20" />
            <span className="text-text-muted">•</span>
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-20 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="flex items-center gap-2 border-b border-border-subtle pb-2">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>

      {/* Main Document Viewer Canvas */}
      <div className="rounded-2xl border border-border-subtle bg-surface-muted/60 p-4 space-y-4">
        {/* PDF / Viewer Toolbar */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>

        {/* Large Document Preview Canvas */}
        <div className="flex items-center justify-center h-[70vh] min-h-[550px] w-full rounded-xl bg-surface/50 border border-border-subtle/50">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}
