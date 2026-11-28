import { Skeleton } from "@/components/ui/Skeleton";

export default function CredentialsLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-7 w-40" />
          </div>
        </div>
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      {/* 3 Tabs */}
      <div className="flex gap-4 border-b border-border-subtle pb-2.5">
        <Skeleton className="h-6 w-24 rounded" />
        <Skeleton className="h-6 w-24 rounded" />
        <Skeleton className="h-6 w-32 rounded" />
      </div>

      {/* Toolbar surface */}
      <div className="toolbar-surface flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* Expandable credential rows */}
      <div className="grid grid-cols-1 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3.5">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
