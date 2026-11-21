import { Skeleton } from "@/components/ui/Skeleton";

export default function SharedLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>

      <div className="card flex items-start gap-3 p-4">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center justify-between border-t border-border-subtle pt-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
