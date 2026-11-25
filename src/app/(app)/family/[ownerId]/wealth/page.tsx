import { auth } from "@/auth";
import Link from "next/link";
import { getFamilySharedWealth } from "@/lib/family-service";
import { calculateWealthSummary, formatCurrency, isLiabilityType } from "@/lib/wealth";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notFound } from "next/navigation";
import { hasFamilyModuleAccess } from "@/lib/family-access";
import { Building2, CreditCard, Lock, User, Wallet } from "lucide-react";

export default async function FamilyOwnerWealthPage({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { ownerId } = await params;

  if (!ownerId || typeof ownerId !== "string") notFound();

  const hasAccess = await hasFamilyModuleAccess(session.user.id, ownerId, "wealth");
  if (!hasAccess) notFound();

  const groups = await getFamilySharedWealth(session.user.id, ownerId);

  return (
    <>
      <PageHeader
        title="Wealth"
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <Link
            href="/family"
            className="btn btn-secondary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
          >
            Manage family
          </Link>
        }
      />

      <div className="mt-6 space-y-6">
        {groups.length === 0 && (
          <Card>
            <EmptyState
              icon={<Wallet className="h-6 w-6" />}
              title="No family wealth shared"
              description="When a family member shares their Wealth module, their accounts will appear here."
              action={
                <Link
                  href="/family"
                  className="btn btn-primary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
                >
                  Go to Family
                </Link>
              }
            />
          </Card>
        )}

        {groups.map((group) => {
          const summary = calculateWealthSummary(group.accounts);

          return (
            <section key={group.membershipId} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info" className="gap-1">
                  <User className="h-3 w-3" />
                  Owner: {group.owner?.name || group.owner?.email || "Family member"}
                </Badge>
                <Badge variant="default" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Read-only
                </Badge>
              </div>

              <div className="space-y-3">
                {summary.summary.currencyTotals.map((total) => (
                  <div key={total.currency}>
                    <p className="mb-2 text-xs font-semibold text-text-secondary">
                      {total.currency}
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Card className="p-4">
                        <p className="text-[11px] text-text-muted">Net worth</p>
                        <p className="mt-1 text-lg font-semibold text-text-primary">
                          {formatCurrency(total.netWorth, total.currency)}
                        </p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-[11px] text-text-muted">Assets</p>
                        <p className="mt-1 text-lg font-semibold text-success">
                          {formatCurrency(total.totalAssets, total.currency)}
                        </p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-[11px] text-text-muted">Liabilities</p>
                        <p className="mt-1 text-lg font-semibold text-danger">
                          {formatCurrency(total.totalLiabilities, total.currency)}
                        </p>
                      </Card>
                    </div>
                  </div>
                ))}
              </div>

              {group.accounts.length === 0 ? (
                <Card className="p-6 text-center text-[13px] text-text-muted">
                  This owner has no wealth accounts to show yet.
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.accounts.map((account) => {
                    const liability = isLiabilityType(account.type);
                    return (
                      <Link
                        key={account.id}
                        href={`/family/wealth/accounts/${account.id}`}
                        className="block"
                      >
                        <Card className="p-4 card-hover">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className={
                                  liability
                                    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-danger/20 bg-danger-subtle text-danger"
                                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand"
                                }
                              >
                                {liability ? (
                                  <CreditCard className="h-5 w-5" />
                                ) : (
                                  <Building2 className="h-5 w-5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-text-primary">
                                  {account.name}
                                </p>
                                <p className="truncate text-[11px] text-text-muted">
                                  {account.provider ||
                                    account.bankName ||
                                    account.type.replace(/_/g, " ")}
                                </p>
                              </div>
                            </div>
                            <Badge variant={account.status === "ACTIVE" ? "success" : "default"}>
                              {account.status}
                            </Badge>
                          </div>

                          <div className="mt-3 border-t border-border-subtle pt-2.5">
                            <p
                              className={
                                liability
                                  ? "text-lg font-semibold text-danger"
                                  : "text-lg font-semibold text-text-primary"
                              }
                            >
                              {formatCurrency(account.currentBalance, account.currency)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-text-muted">
                              {account._count?.transactions || 0} transactions
                            </p>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
