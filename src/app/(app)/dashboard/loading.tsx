import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-[46px] w-full rounded-xl" />
      </div>

      {/* Responsive Module Grid — Max 3 cards per row on desktop, 2 on tablet, 1 on mobile */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, cardIndex) => (
          <div key={cardIndex} className="card flex flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-md" />
                <div className="space-y-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <Skeleton className="h-3.5 w-10" />
            </div>

            <div className="flex flex-1 flex-col space-y-4 p-5">
              {cardIndex === 1 ? (
                <>
                  <div className="space-y-2.5">
                    <Skeleton className="h-2.5 w-24" />
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-1.5 w-full rounded-full" />
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-12 rounded-lg" />
                      <Skeleton className="h-12 rounded-lg" />
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-border-subtle pt-3">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 rounded-lg border border-border-subtle bg-surface-muted/45 p-2.5">
                    <Skeleton className="h-9 rounded" />
                    <Skeleton className="h-9 rounded" />
                    <Skeleton className="h-9 rounded" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                </>
              )}
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
