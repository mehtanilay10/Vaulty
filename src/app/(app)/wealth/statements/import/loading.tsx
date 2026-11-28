import { Skeleton } from "@/components/ui/Skeleton";

export default function StatementImportLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-16" />
          <span className="text-text-muted/50 text-xs">/</span>
          <Skeleton className="h-3 w-14" />
          <span className="text-text-muted/50 text-xs">/</span>
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-52" />
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
