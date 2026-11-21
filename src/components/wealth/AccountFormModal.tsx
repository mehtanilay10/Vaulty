"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { AlertCircle, Check, Info, Tags, Wallet, X } from "lucide-react";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Alert } from "@/components/ui/Alert";
import { MultiSelectPills, type MultiSelectOption } from "@/components/ui/MultiSelectPills";
import { CURRENCY_OPTIONS } from "@/lib/wealth";
import type { WealthAccountDTO } from "@/types";

const PAYMENT_REMINDER_OPTIONS: MultiSelectOption[] = [
  { value: 0, label: "On due date", hint: "Day 0 (Due date itself)" },
  { value: 1, label: "1 day before", hint: "24 hours before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before", hint: "7 days before" },
  { value: 14, label: "2 weeks before", hint: "14 days before" },
];

const EXPIRY_REMINDER_OPTIONS: MultiSelectOption[] = [
  { value: 0, label: "On expiry date", hint: "Day 0 (Expiry date itself)" },
  { value: 1, label: "1 day before", hint: "Final notice" },
  { value: 7, label: "1 week before", hint: "7 days before" },
  { value: 15, label: "15 days before" },
  { value: 30, label: "1 month before", hint: "30 days before" },
  { value: 60, label: "2 months before", hint: "60 days before" },
];

const COMMON_TAG_SUGGESTIONS: MultiSelectOption[] = [
  { value: "family", label: "family" },
  { value: "personal", label: "personal" },
  { value: "salary", label: "salary" },
  { value: "emergency", label: "emergency" },
  { value: "tax-saving", label: "tax-saving" },
  { value: "retirement", label: "retirement" },
  { value: "investments", label: "investments" },
];

const ACCOUNT_TYPES = [
  ["SAVINGS_ACCOUNT", "Savings Account"],
  ["CURRENT_ACCOUNT", "Current Account"],
  ["CREDIT_CARD", "Credit Card"],
  ["MUTUAL_FUND", "Mutual Fund"],
  ["STOCK_PORTFOLIO", "Stock Portfolio"],
  ["LOAN", "Loan"],
  ["PPF", "PPF"],
  ["PF", "PF"],
  ["GIFT_CARD", "Gift Card"],
  ["VOUCHER", "Voucher"],
  ["FIXED_DEPOSIT", "Fixed Deposit"],
  ["RECURRING_DEPOSIT", "Recurring Deposit"],
  ["CASH", "Cash"],
  ["OTHER", "Other"],
] as const;

const ACCOUNT_STATUSES = [
  ["ACTIVE", "Active"],
  ["INACTIVE", "Inactive"],
  ["CLOSED", "Closed"],
  ["FROZEN", "Frozen"],
] as const;

const INVESTMENT_TYPES = ["MUTUAL_FUND", "STOCK_PORTFOLIO"];
const BANK_TYPES = ["SAVINGS_ACCOUNT", "CURRENT_ACCOUNT"];

interface AccountFormState {
  name: string;
  type: string;
  status: string;
  currentBalance: string;
  currency: string;
  category: string;
  accountNumber: string;
  provider: string;
  branchName: string;
  creditLimit: string;
  billingCycle: string;
  dueDate: string;
  isin: string;
  broker: string;
  dematAccount: string;
  loanType: string;
  interestRate: string;
  emiAmount: string;
  tenureMonths: string;
  startDate: string;
  endDate: string;
  expiryDate: string;
  notes: string;
  tags: string[];
  paymentNotifyDaysBefore: number[];
  expiryNotifyDaysBefore: number[];
}

const EMPTY_FORM: AccountFormState = {
  name: "",
  type: "SAVINGS_ACCOUNT",
  status: "ACTIVE",
  currentBalance: "0",
  currency: "INR",
  category: "",
  accountNumber: "",
  provider: "",
  branchName: "",
  creditLimit: "",
  billingCycle: "",
  dueDate: "",
  isin: "",
  broker: "",
  dematAccount: "",
  loanType: "",
  interestRate: "",
  emiAmount: "",
  tenureMonths: "",
  startDate: "",
  endDate: "",
  expiryDate: "",
  notes: "",
  tags: [],
  paymentNotifyDaysBefore: [7, 3, 1, 0],
  expiryNotifyDaysBefore: [30, 7, 1, 0],
};

function toInputValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseDaysArray(val: unknown, fallback: number[]): number[] {
  if (Array.isArray(val)) {
    const nums = val.map(Number).filter((n) => Number.isInteger(n) && n >= 0);
    return nums.length > 0 ? nums : fallback;
  }
  if (typeof val === "string") {
    const nums = val
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0);
    return nums.length > 0 ? nums : fallback;
  }
  return fallback;
}

function parseTagsArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map(String).filter(Boolean);
  }
  if (typeof val === "string") {
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function buildForm(account?: Partial<WealthAccountDTO>): AccountFormState {
  if (!account) return { ...EMPTY_FORM };

  return {
    name: toInputValue(account.name),
    type: toInputValue(account.type) || "SAVINGS_ACCOUNT",
    status: toInputValue(account.status) || "ACTIVE",
    currentBalance: toInputValue(account.currentBalance),
    currency: toInputValue(account.currency) || "INR",
    category: toInputValue(account.category),
    accountNumber: toInputValue(account.accountNumber),
    provider: toInputValue(account.provider || account.bankName),
    branchName: toInputValue(account.branchName),
    creditLimit: toInputValue(account.creditLimit),
    billingCycle: toInputValue(account.billingCycle),
    dueDate: toInputValue(account.dueDate),
    isin: toInputValue(account.isin),
    broker: toInputValue(account.broker),
    dematAccount: toInputValue(account.dematAccount),
    loanType: toInputValue(account.loanType),
    interestRate: toInputValue(account.interestRate),
    emiAmount: toInputValue(account.emiAmount),
    tenureMonths: toInputValue(account.tenureMonths),
    startDate: toDateInputValue(account.startDate),
    endDate: toDateInputValue(account.endDate),
    expiryDate: toDateInputValue(account.expiryDate),
    notes: toInputValue(account.notes),
    tags: parseTagsArray(account.tags),
    paymentNotifyDaysBefore: parseDaysArray(account.paymentNotifyDaysBefore, [7, 3, 1, 0]),
    expiryNotifyDaysBefore: parseDaysArray(account.expiryNotifyDaysBefore, [30, 7, 1, 0]),
  };
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

export function AccountFormModal({
  isOpen,
  onClose,
  account,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  account?: Partial<WealthAccountDTO> | null;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<AccountFormState>(() => buildForm(account || undefined));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof AccountFormState>(field: K, value: AccountFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const isEditing = Boolean(account?.id);
  const isCreditCard = form.type === "CREDIT_CARD";
  const isLoan = form.type === "LOAN";
  const isInvestment = INVESTMENT_TYPES.includes(form.type);
  const isBank = BANK_TYPES.includes(form.type);
  const currencySymbol = getCurrencySymbol(form.currency);
  const currencyOptions = CURRENCY_OPTIONS.some((option) => option.code === form.currency)
    ? CURRENCY_OPTIONS
    : [...CURRENCY_OPTIONS, { code: form.currency, label: `${form.currency} — Custom` }];

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!form.name.trim()) {
      setError("Account name is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        isEditing ? `/api/wealth/accounts/${account?.id}` : "/api/wealth/accounts",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(form),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save account.");
      }

      onClose();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Wealth Account" : "Add Wealth Account"}
      description={
        isEditing
          ? "Update the details for this account."
          : "Add a bank account, card, investment, or loan to your net worth."
      }
      icon={<Wallet className="h-4 w-4" />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.name.trim()}>
            {loading ? (
              "Saving..."
            ) : (
              <>
                <Check className="w-4 h-4" />
                {isEditing ? "Save Changes" : "Add Account"}
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
          icon={<Wallet className="h-4 w-4" />}
          title="Account details"
          description="The essentials used to calculate your net worth."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">
                Account Type <span className="text-danger">*</span>
              </Label>
              <Select
                value={form.type}
                onChange={(event) => update("type", event.target.value)}
                className="h-10 w-full"
              >
                {ACCOUNT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">
                Account Name <span className="text-danger">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="e.g. HDFC Savings"
                className="h-10"
                autoFocus
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Provider</Label>
              <Input
                value={form.provider}
                onChange={(event) => update("provider", event.target.value)}
                placeholder="e.g. HDFC Bank, Zerodha"
                className="h-10"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Currency</Label>
              <Select
                value={form.currency}
                onChange={(event) => update("currency", event.target.value)}
                className="h-10 w-full"
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">
                {isCreditCard || isLoan ? "Outstanding Balance" : "Current Balance"}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-muted">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={form.currentBalance}
                  onChange={(event) => update("currentBalance", event.target.value)}
                  placeholder="0.00"
                  className="h-12 pl-10 text-lg font-semibold"
                />
              </div>
              <p className="mt-1.5 text-xs text-text-muted">
                {isCreditCard || isLoan
                  ? "Enter the amount owed as a positive number."
                  : "Enter the current available balance."}
              </p>
            </div>
          </div>
        </FieldSection>

        <FieldSection
          icon={<Info className="h-4 w-4" />}
          title="Additional details"
          description="Optional information to keep this account organized."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <Select
                value={form.status}
                onChange={(event) => update("status", event.target.value)}
                className="h-10 w-full"
              >
                {ACCOUNT_STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">Category</Label>
              <Input
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                placeholder="e.g. Emergency fund"
                className="h-10"
              />
            </div>

            {(isBank || isCreditCard || isLoan) && (
              <>
                <div>
                  <Label className="mb-1.5 block">Account Number</Label>
                  <Input
                    value={form.accountNumber}
                    onChange={(event) => update("accountNumber", event.target.value)}
                    placeholder="Optional"
                    className="h-10"
                  />
                </div>

                <div>
                  <Label className="mb-1.5 block">Branch Name</Label>
                  <Input
                    value={form.branchName}
                    onChange={(event) => update("branchName", event.target.value)}
                    placeholder="Optional"
                    className="h-10"
                  />
                </div>
              </>
            )}

            {isCreditCard && (
              <>
                <div>
                  <Label className="mb-1.5 block">Credit Limit</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.creditLimit}
                    onChange={(event) => update("creditLimit", event.target.value)}
                    placeholder="0.00"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Billing Cycle</Label>
                  <Input
                    value={form.billingCycle}
                    onChange={(event) => update("billingCycle", event.target.value)}
                    placeholder="e.g. 1st - 30th"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Due Day</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dueDate}
                    onChange={(event) => update("dueDate", event.target.value)}
                    placeholder="e.g. 15"
                    className="h-10"
                  />
                </div>
              </>
            )}

            {isInvestment && (
              <>
                <div>
                  <Label className="mb-1.5 block">ISIN</Label>
                  <Input
                    value={form.isin}
                    onChange={(event) => update("isin", event.target.value)}
                    placeholder="Optional"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Broker</Label>
                  <Input
                    value={form.broker}
                    onChange={(event) => update("broker", event.target.value)}
                    placeholder="e.g. Zerodha"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Demat Account</Label>
                  <Input
                    value={form.dematAccount}
                    onChange={(event) => update("dematAccount", event.target.value)}
                    placeholder="Optional"
                    className="h-10"
                  />
                </div>
              </>
            )}

            {isLoan && (
              <>
                <div>
                  <Label className="mb-1.5 block">Loan Type</Label>
                  <Input
                    value={form.loanType}
                    onChange={(event) => update("loanType", event.target.value)}
                    placeholder="e.g. Home loan"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Interest Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.interestRate}
                    onChange={(event) => update("interestRate", event.target.value)}
                    placeholder="e.g. 8.5"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">EMI Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.emiAmount}
                    onChange={(event) => update("emiAmount", event.target.value)}
                    placeholder="0.00"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Tenure (months)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.tenureMonths}
                    onChange={(event) => update("tenureMonths", event.target.value)}
                    placeholder="e.g. 240"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Start Date</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => update("startDate", event.target.value)}
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">End Date</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => update("endDate", event.target.value)}
                    className="h-10"
                  />
                </div>
              </>
            )}

            {!isBank && (
              <div>
                <Label className="mb-1.5 block">Expiry Date</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) => update("expiryDate", event.target.value)}
                  className="h-10"
                />
              </div>
            )}
          </div>
        </FieldSection>

        {(isCreditCard || !isBank) && (
          <FieldSection
            icon={<Info className="h-4 w-4" />}
            title="Reminder notifications"
            description="Customize when you receive notifications for this account."
          >
            <div className="space-y-4">
              {isCreditCard && (
                <div>
                  <Label className="mb-1.5 block">Payment Reminder Schedule</Label>
                  <MultiSelectPills
                    options={PAYMENT_REMINDER_OPTIONS}
                    value={form.paymentNotifyDaysBefore}
                    onChange={(vals) => update("paymentNotifyDaysBefore", vals as number[])}
                    placeholder="Select reminder schedule..."
                    badgeClassName="bg-primary/10 text-primary border-primary/20"
                  />
                  <p className="mt-1.5 text-xs text-text-muted">
                    Choose when to be notified. &quot;On due date&quot; alerts you on the due date
                    itself.
                  </p>
                </div>
              )}
              {!isBank && (
                <div>
                  <Label className="mb-1.5 block">Expiry Reminder Schedule</Label>
                  <MultiSelectPills
                    options={EXPIRY_REMINDER_OPTIONS}
                    value={form.expiryNotifyDaysBefore}
                    onChange={(vals) => update("expiryNotifyDaysBefore", vals as number[])}
                    placeholder="Select expiry reminders..."
                    badgeClassName="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                  />
                  <p className="mt-1.5 text-xs text-text-muted">
                    Choose when to be notified before account expiry.
                  </p>
                </div>
              )}
            </div>
          </FieldSection>
        )}

        <FieldSection icon={<Tags className="h-4 w-4" />} title="Tags & Notes">
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Tags</Label>
              <MultiSelectPills
                options={COMMON_TAG_SUGGESTIONS}
                value={form.tags}
                onChange={(vals) => update("tags", vals as string[])}
                allowCustom
                placeholder="Select or type tags and press Enter..."
              />
              <p className="mt-1.5 text-xs text-text-muted">
                Pick from suggestions or type custom tags and press Enter or comma.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 block">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Anything you want to remember about this account"
                className="h-32 w-full"
              />
            </div>
          </div>
        </FieldSection>
      </form>
    </Blade>
  );
}
