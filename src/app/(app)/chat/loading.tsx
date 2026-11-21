import { Skeleton } from "@/components/ui/Skeleton";

export default function ChatLoading() {
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="hidden lg:block">
        <div className="card space-y-2 p-3">
          <Skeleton className="h-9 w-full" />
          <div className="space-y-1.5 pt-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md px-2 py-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card flex min-h-[60vh] flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-4 p-6">
          <div className="mx-auto space-y-3 text-center">
            <Skeleton className="mx-auto h-12 w-12 rounded-xl" />
            <Skeleton className="mx-auto h-5 w-56 max-w-full" />
            <Skeleton className="mx-auto h-3 w-72 max-w-full" />
          </div>
          <div className="mx-auto grid w-full max-w-xl gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        </div>

        <div className="border-t border-border-subtle p-3">
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
