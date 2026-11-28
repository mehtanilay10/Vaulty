import { Skeleton } from "@/components/ui/Skeleton";

export default function NotesLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      <div className="flex h-[calc(100vh-225px)] min-h-[580px] flex-col gap-4 lg:flex-row">
        <div className="card flex w-full shrink-0 flex-col overflow-hidden p-0 lg:w-80">
          <div className="space-y-2.5 border-b border-border-subtle p-3">
            <Skeleton className="h-8.5 w-full rounded-lg" />
            <div className="flex justify-between px-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 p-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            ))}
          </div>
        </div>

        <div className="card hidden flex-1 flex-col overflow-hidden p-0 lg:flex">
          <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-3 w-36" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2 border-b border-border-subtle px-6 py-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-7 rounded" />
            ))}
          </div>
          <div className="space-y-3 p-8">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
