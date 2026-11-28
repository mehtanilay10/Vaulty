import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/wealth";

const ASSET_COLORS = [
  "#1e40af",
  "#0f766e",
  "#2563eb",
  "#059669",
  "#0284c7",
  "#4f46e5",
  "#65a30d",
  "#d97706",
  "#0d9488",
  "#475569",
  "#0369a1",
  "#64748b",
];

const LIABILITY_COLORS = [
  "#be123c",
  "#dc2626",
  "#ea580c",
  "#e11d48",
  "#d97706",
  "#9f1239",
  "#f43f5e",
  "#b91c1c",
  "#f97316",
  "#78716c",
  "#fb7185",
  "#a8a29e",
];

interface WealthBreakdownItem {
  type: string;
  amount: number;
  percentage: number;
}

function humanizeType(type: string): string {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number) {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

function formatCompactCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatCurrency(amount, currency);
  }
}

export function WealthBreakdownChart({
  items,
  currency = "INR",
  title,
  tone = "asset",
  emptyMessage,
}: {
  items: WealthBreakdownItem[];
  currency?: string;
  title: string;
  tone?: "asset" | "liability";
  emptyMessage: string;
}) {
  const colors = tone === "liability" ? LIABILITY_COLORS : ASSET_COLORS;
  const chartItems = items
    .filter((item) => Number(item.amount) > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = chartItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const center = 80;
  const radius = 64;
  let cumulative = 0;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <p className="mt-0.5 text-xs text-text-muted">Breakdown by account type</p>
      </div>

      {total <= 0 ? (
        <div className="flex min-h-[13rem] items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface-muted/40 px-6 py-8">
          <p className="max-w-xs text-center text-sm text-text-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(0,12rem)_1fr]">
          <div className="relative mx-auto w-full max-w-[12rem]">
            <svg
              viewBox="0 0 160 160"
              role="img"
              aria-label={`${title} breakdown by account type`}
              className="h-auto w-full"
            >
              {chartItems.length === 1 ? (
                <circle cx={center} cy={center} r={radius} fill={colors[0]} />
              ) : (
                chartItems.map((item, index) => {
                  const startAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
                  cumulative += Number(item.amount);
                  const endAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
                  const start = polarPoint(center, center, radius, startAngle);
                  const end = polarPoint(center, center, radius, endAngle);
                  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

                  return (
                    <path
                      key={item.type}
                      d={`M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`}
                      fill={colors[index % colors.length]}
                      stroke="var(--surface)"
                      strokeWidth="2"
                    />
                  );
                })
              )}
              <circle cx={center} cy={center} r={38} fill="var(--surface)" />
              <text
                x={center}
                y={center - 5}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="8"
                fontWeight="500"
              >
                {tone === "liability" ? "Total Liabilities" : "Total Assets"}
              </text>
              <text
                x={center}
                y={center + 9}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="10"
                fontWeight="700"
              >
                {formatCompactCurrency(total, currency)}
              </text>
            </svg>
          </div>

          <div className="space-y-2.5">
            {chartItems.map((item, index) => {
              const percentage = (Number(item.amount) / total) * 100;
              const swatchColor = colors[index % colors.length];

              return (
                <div key={item.type} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: swatchColor }}
                      />
                      <span className="truncate text-[13px] font-medium text-text-primary">
                        {humanizeType(item.type)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2.5 text-right font-mono tabular-nums">
                      <span className="text-[13px] font-semibold text-text-primary">
                        {formatCurrency(item.amount, currency)}
                      </span>
                      <span className="w-11 text-[11px] text-text-muted">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(percentage, 2)}%`,
                        backgroundColor: swatchColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
