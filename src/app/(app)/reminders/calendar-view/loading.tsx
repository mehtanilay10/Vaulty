import { Card } from "@/components/ui/Card";

export default function CalendarLoading() {
  return (
    <div className="space-y-6">
      {/* Page Header Skeleton */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-10 rounded bg-surface-muted animate-pulse" />
          <span className="text-text-muted">/</span>
          <div className="h-3 w-20 rounded bg-surface-muted animate-pulse" />
          <span className="text-text-muted">/</span>
          <div className="h-3 w-24 rounded bg-surface-muted animate-pulse" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="h-6 w-40 rounded bg-surface-muted animate-pulse" />
          <div className="h-9 w-24 rounded-lg bg-surface-muted animate-pulse" />
        </div>
      </div>

      {/* Month Navigator & Filter Pills Card Skeleton */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-36 rounded bg-surface-muted animate-pulse" />
            <div className="flex items-center gap-1">
              <div className="h-8 w-8 rounded-lg bg-surface-muted animate-pulse" />
              <div className="h-8 w-14 rounded-lg bg-surface-muted animate-pulse" />
              <div className="h-8 w-8 rounded-lg bg-surface-muted animate-pulse" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="h-7 w-12 rounded-full bg-surface-muted animate-pulse" />
            <div className="h-7 w-24 rounded-full bg-surface-muted animate-pulse" />
            <div className="h-7 w-24 rounded-full bg-surface-muted animate-pulse" />
            <div className="h-7 w-24 rounded-full bg-surface-muted animate-pulse" />
          </div>
        </div>
      </Card>

      {/* Calendar Grid Card Skeleton */}
      <Card className="overflow-hidden p-0 border border-border-subtle shadow-sm">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-muted/50 py-2.5 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-[11px] font-semibold text-text-muted">
              {day}
            </div>
          ))}
        </div>

        {/* 5 Rows of 7 Days Grid */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border-subtle">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[90px] sm:min-h-[110px] p-2 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-5 rounded-full bg-surface-muted animate-pulse" />
                {i % 4 === 0 && <div className="h-3 w-4 rounded bg-surface-muted animate-pulse" />}
              </div>
              <div className="space-y-1.5 mt-2">
                {i % 3 === 0 && (
                  <div className="h-4 w-full rounded bg-surface-muted/80 animate-pulse" />
                )}
                {i % 5 === 0 && (
                  <div className="h-4 w-3/4 rounded bg-surface-muted/60 animate-pulse" />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Selected Day Agenda Skeleton */}
      <Card className="p-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="h-5 w-48 rounded bg-surface-muted animate-pulse" />
          <div className="h-5 w-16 rounded-full bg-surface-muted animate-pulse" />
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-14 rounded-xl bg-surface-muted/60 animate-pulse" />
          <div className="h-14 rounded-xl bg-surface-muted/60 animate-pulse" />
        </div>
      </Card>
    </div>
  );
}
