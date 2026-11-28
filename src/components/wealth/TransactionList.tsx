"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/wealth";
import type { WealthTransactionDTO } from "@/types";
import { ArrowUpRight, ArrowDownRight, Receipt, Pencil, Trash2 } from "lucide-react";

interface TransactionListProps {
  transactions: WealthTransactionDTO[];
  showAccount?: boolean;
  onEdit?: (transaction: WealthTransactionDTO) => void;
  onDelete?: (transaction: WealthTransactionDTO) => void;
}

const transactionTypeStyles: Record<string, string> = {
  DEPOSIT: "border-success/20 bg-success-subtle text-success",
  WITHDRAWAL: "border-danger/20 bg-danger-subtle text-danger",
  PURCHASE: "border-warning/25 bg-warning-subtle text-warning",
  SALE: "border-success/20 bg-success-subtle text-success",
  INTEREST: "border-success/20 bg-success-subtle text-success",
  DIVIDEND: "border-success/20 bg-success-subtle text-success",
  FEE: "border-danger/20 bg-danger-subtle text-danger",
  PAYMENT: "border-danger/20 bg-danger-subtle text-danger",
  REFUND: "border-success/20 bg-success-subtle text-success",
  TRANSFER_IN: "border-success/20 bg-success-subtle text-success",
  TRANSFER_OUT: "border-danger/20 bg-danger-subtle text-danger",
  ADJUSTMENT: "border-border-subtle bg-surface-muted text-text-muted",
};

const positiveTypes = ["DEPOSIT", "SALE", "INTEREST", "DIVIDEND", "REFUND", "TRANSFER_IN"];

export function TransactionList({
  transactions,
  showAccount = false,
  onEdit,
  onDelete,
}: TransactionListProps) {
  const isPositive = (transaction: WealthTransactionDTO) => {
    if (transaction.type === "ADJUSTMENT") {
      return Number(transaction.amount) >= 0;
    }
    return positiveTypes.includes(transaction.type);
  };

  if (transactions.length === 0) {
    return (
      <Card className="p-0">
        <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-text-muted">
            <Receipt className="h-5 w-5" />
          </div>
          <p className="text-[13px] font-semibold text-text-primary">No transactions found</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Transactions added to this account will appear here.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y divide-border-subtle">
        {transactions.map((transaction) => {
          const positive = isPositive(transaction);
          const toneStyle =
            transactionTypeStyles[transaction.type] || transactionTypeStyles.ADJUSTMENT;
          const amount = Math.abs(Number(transaction.amount));

          return (
            <div
              key={transaction.id}
              className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted/60"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneStyle}`}
                >
                  {positive ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-text-primary">
                    {transaction.description}
                  </p>
                  <p className="truncate font-mono text-[11px] tabular-nums text-text-muted">
                    {showAccount && transaction.account?.name ? (
                      <>
                        <Link
                          href={`/wealth/accounts/${transaction.accountId}`}
                          className="font-sans font-medium text-text-secondary hover:text-brand hover:underline"
                        >
                          {transaction.account.name}
                        </Link>
                        <span> · </span>
                      </>
                    ) : null}
                    {new Date(transaction.date).toLocaleDateString()} ·{" "}
                    {transaction.type.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <div className="min-w-[110px] text-right">
                  <p
                    className={`font-mono text-[13px] font-semibold tabular-nums ${
                      positive ? "text-success" : "text-danger"
                    }`}
                  >
                    {positive ? "+" : "-"}
                    {formatCurrency(amount, transaction.currency, 2)}
                  </p>
                  {transaction.category && (
                    <Badge variant="default" className="mt-0.5">
                      {transaction.category}
                    </Badge>
                  )}
                </div>
                {(onEdit || onDelete) && (
                  <div className="flex shrink-0 items-center gap-1">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(transaction)}
                        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
                        aria-label="Edit transaction"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(transaction)}
                        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-subtle hover:text-danger"
                        aria-label="Delete transaction"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
