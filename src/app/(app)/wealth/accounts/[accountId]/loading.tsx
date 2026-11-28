import { Skeleton } from "@/components/ui/Skeleton";

export default function AccountDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-14" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-18" />
            <span className="text-text-muted/50 text-xs">/</span>
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-7 w-56" />
          </div>
        </div>
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card h-fit overflow-hidden p-0">
          <div className="space-y-2 border-b border-border-subtle p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-8 w-32 rounded-lg" />
          </div>
          <div className="card divide-y divide-border-subtle overflow-hidden p-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-44" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
