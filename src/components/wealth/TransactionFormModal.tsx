"use client";

import { useState, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { AlertCircle, ArrowLeftRight, Check, FileText, Info, X } from "lucide-react";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Alert } from "@/components/ui/Alert";
import { isLiabilityType } from "@/lib/wealth";
import type { WealthTransactionDTO } from "@/types";

const TRANSACTION_TYPES = [
  ["DEPOSIT", "Deposit"],
  ["WITHDRAWAL", "Withdrawal"],
  ["PURCHASE", "Purchase"],
  ["SALE", "Sale"],
  ["INTEREST", "Interest"],
  ["DIVIDEND", "Dividend"],
  ["FEE", "Fee"],
  ["PAYMENT", "Payment"],
  ["REFUND", "Refund"],
  ["TRANSFER_IN", "Transfer In"],
  ["TRANSFER_OUT", "Transfer Out"],
  ["ADJUSTMENT", "Adjustment"],
] as const;

interface TransactionFormState {
  type: string;
  amount: string;
  description: string;
  date: string;
  category: string;
  referenceNumber: string;
  notes: string;
}

function todayInputValue(): string {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getDefaultType(accountType?: string): string {
  if (accountType === "CREDIT_CARD") return "PURCHASE";
  if (accountType === "LOAN") return "PAYMENT";
  return "DEPOSIT";
}

function getCurrencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value || currency
    );
  } catch {
    return currency;
  }
}

function FieldSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-muted/40 p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-brand-subtle p-2 text-brand">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function TransactionFormModal({
  isOpen,
  onClose,
  accountId,
  accountCurrency = "INR",
  accountType,
  onSaved,
  transaction = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountCurrency?: string;
  accountType?: string;
  onSaved?: () => void;
  transaction?: WealthTransactionDTO | null;
}) {
  const [form, setForm] = useState<TransactionFormState>({
    type: getDefaultType(accountType),
    amount: "",
    description: "",
    date: todayInputValue(),
    category: "",
    referenceNumber: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!transaction;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    if (transaction) {
      setForm({
        type: transaction.type,
        amount: String(transaction.amount),
        description: transaction.description,
        date: new Date(transaction.date).toISOString().slice(0, 10),
        category: transaction.category || "",
        referenceNumber: transaction.referenceNumber || "",
        notes: transaction.notes || "",
      });
    } else {
      setForm({
        type: getDefaultType(accountType),
        amount: "",
        description: "",
        date: todayInputValue(),
        category: "",
        referenceNumber: "",
        notes: "",
      });
    }
  }, [isOpen, transaction, accountType]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const update = (field: keyof TransactionFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const currencySymbol = getCurrencySymbol(accountCurrency);
  const liability = isLiabilityType(accountType || "");
  const isAdjustment = form.type === "ADJUSTMENT";

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const amount = Number(form.amount);
    if (!form.amount || !Number.isFinite(amount) || amount === 0) {
      setError("Enter a non-zero amount.");
      return;
    }

    if (!form.description.trim()) {
      setError("Description is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        isEdit
          ? `/api/wealth/accounts/${accountId}/transactions/${transaction!.id}`
          : `/api/wealth/accounts/${accountId}/transactions`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            ...form,
            currency: accountCurrency,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || (isEdit ? "Failed to update transaction." : "Failed to add transaction."),
        );
      }

      onClose();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add transaction.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Transaction" : "Add Transaction"}
      description={
        isEdit ? "Update this transaction." : "Record money moving in, out, or between balances."
      }
      icon={<ArrowLeftRight className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              "Saving..."
            ) : (
              <>
                <Check className="h-4 w-4" />
                {isEdit ? "Update Transaction" : "Add Transaction"}
              </>
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}

        <FieldSection
          icon={<ArrowLeftRight className="h-4 w-4" />}
          title="Transaction details"
          description="The amount and direction of this transaction."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">
                Type <span className="text-danger">*</span>
              </Label>
              <Select
                value={form.type}
                onChange={(event) => update("type", event.target.value)}
                className="h-10 w-full"
              >
                {TRANSACTION_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => update("date", event.target.value)}
                className="h-10"
              />
            </div>

            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">
                Amount <span className="text-danger">*</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-muted">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => update("amount", event.target.value)}
                  placeholder="0.00"
                  className="h-12 pl-10 text-lg font-semibold"
                  autoFocus
                />
              </div>
              <p className="mt-1.5 text-xs text-text-muted">
                {isAdjustment
                  ? "Use a positive or negative amount to correct the balance."
                  : "Enter a positive amount. The transaction type sets the direction."}
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">
                Description <span className="text-danger">*</span>
              </Label>
              <Input
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="e.g. Monthly salary"
                className="h-10"
              />
            </div>
          </div>
        </FieldSection>

        <FieldSection
          icon={<Info className="h-4 w-4" />}
          title="Categorization"
          description="Optional details to make this transaction easier to find."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Category</Label>
              <Input
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                placeholder="e.g. Salary, Rent"
                className="h-10"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Reference Number</Label>
              <Input
                value={form.referenceNumber}
                onChange={(event) => update("referenceNumber", event.target.value)}
                placeholder="Optional"
                className="h-10"
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-text-muted">
            {liability
              ? "Purchases, fees, and interest increase the outstanding balance. Payments and refunds reduce it."
              : "Deposits, interest, refunds, and transfers in increase the balance. Withdrawals, purchases, fees, and transfers out reduce it."}
          </p>
        </FieldSection>

        <FieldSection icon={<FileText className="h-4 w-4" />} title="Notes">
          <Label className="mb-1.5 block">Notes</Label>
          <Textarea
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
            placeholder="Optional notes about this transaction"
          />
        </FieldSection>
      </form>
    </Blade>
  );
}
