export const WEALTH_ACCOUNT_TYPES = [
  "SAVINGS_ACCOUNT",
  "CURRENT_ACCOUNT",
  "CREDIT_CARD",
  "MUTUAL_FUND",
  "STOCK_PORTFOLIO",
  "LOAN",
  "PPF",
  "PF",
  "GIFT_CARD",
  "VOUCHER",
  "FIXED_DEPOSIT",
  "RECURRING_DEPOSIT",
  "CASH",
  "OTHER",
] as const;

export const WEALTH_ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE", "CLOSED", "FROZEN"] as const;

export const WEALTH_TRANSACTION_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "PURCHASE",
  "SALE",
  "INTEREST",
  "DIVIDEND",
  "FEE",
  "PAYMENT",
  "REFUND",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT",
] as const;

export type WealthAccountType = (typeof WEALTH_ACCOUNT_TYPES)[number];
export type WealthTransactionType = (typeof WEALTH_TRANSACTION_TYPES)[number];

export const CURRENCY_OPTIONS = [
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
  { code: "SAR", label: "SAR — Saudi Riyal" },
  { code: "QAR", label: "QAR — Qatari Riyal" },
  { code: "KWD", label: "KWD — Kuwaiti Dinar" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
] as const;

export const LIABILITY_ACCOUNT_TYPES: readonly string[] = ["CREDIT_CARD", "LOAN"];

const ASSET_INCREASE_TYPES: readonly string[] = [
  "DEPOSIT",
  "SALE",
  "INTEREST",
  "DIVIDEND",
  "REFUND",
  "TRANSFER_IN",
];

const LIABILITY_INCREASE_TYPES: readonly string[] = [
  "PURCHASE",
  "WITHDRAWAL",
  "INTEREST",
  "FEE",
  "TRANSFER_OUT",
];

export function isLiabilityType(type: string): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type);
}

export function getBalanceDelta(
  accountType: string,
  transactionType: string,
  amount: number,
): number {
  if (!Number.isFinite(amount)) return 0;

  if (transactionType === "ADJUSTMENT") {
    return amount;
  }

  const absoluteAmount = Math.abs(amount);

  if (isLiabilityType(accountType)) {
    return LIABILITY_INCREASE_TYPES.includes(transactionType) ? absoluteAmount : -absoluteAmount;
  }

  return ASSET_INCREASE_TYPES.includes(transactionType) ? absoluteAmount : -absoluteAmount;
}

export function getStoredTransactionAmount(transactionType: string, amount: number): number {
  return transactionType === "ADJUSTMENT" ? amount : Math.abs(amount);
}

export interface WealthSummaryAccount {
  type: string;
  currentBalance: unknown;
  currency?: string | null;
  category?: string | null;
}

export interface WealthCurrencySummary {
  currency: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  accountCount: number;
  byType: Array<{ type: string; amount: number; percentage: number }>;
  liabilityByType: Array<{ type: string; amount: number; percentage: number }>;
  byCategory: Array<{ category: string; amount: number; percentage: number }>;
}

/** Aggregate only within a currency. Values from different currencies are never added. */
export function calculateWealthSummary(accounts: WealthSummaryAccount[]) {
  const groups = new Map<string, WealthSummaryAccount[]>();
  for (const account of accounts) {
    const currency = normalizeCurrency(account.currency);
    const group = groups.get(currency) ?? [];
    group.push(account);
    groups.set(currency, group);
  }

  const currencyTotals: WealthCurrencySummary[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, currencyAccounts]) => {
      let totalAssets = 0;
      let totalLiabilities = 0;
      const byType: Record<string, number> = {};
      const liabilityByType: Record<string, number> = {};
      const byCategory: Record<string, number> = {};

      for (const account of currencyAccounts) {
        const balance = Number(account.currentBalance) || 0;
        if (isLiabilityType(account.type)) {
          const amount = Math.abs(balance);
          totalLiabilities += amount;
          liabilityByType[account.type] = (liabilityByType[account.type] || 0) + amount;
        } else {
          totalAssets += balance;
          byType[account.type] = (byType[account.type] || 0) + balance;
          if (account.category)
            byCategory[account.category] = (byCategory[account.category] || 0) + balance;
        }
      }

      const calcPercentage = (amount: number, total: number): number =>
        total > 0 && Number.isFinite(total) && Number.isFinite(amount) ? (amount / total) * 100 : 0;

      return {
        currency,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        accountCount: currencyAccounts.length,
        byType: Object.entries(byType).map(([type, amount]) => ({
          type,
          amount,
          percentage: calcPercentage(amount, totalAssets),
        })),
        liabilityByType: Object.entries(liabilityByType).map(([type, amount]) => ({
          type,
          amount,
          percentage: calcPercentage(amount, totalLiabilities),
        })),
        byCategory: Object.entries(byCategory).map(([category, amount]) => ({
          category,
          amount,
          percentage: calcPercentage(amount, totalAssets),
        })),
      };
    });

  const single = currencyTotals.length === 1 ? currencyTotals[0] : null;
  return {
    summary: {
      totalAssets: single?.totalAssets ?? 0,
      totalLiabilities: single?.totalLiabilities ?? 0,
      netWorth: single?.netWorth ?? 0,
      accountCount: accounts.length,
      currencyTotals,
    },
    breakdown: {
      byType: single?.byType ?? [],
      liabilityByType: single?.liabilityByType ?? [],
      byCategory: single?.byCategory ?? [],
      byCurrency: currencyTotals,
    },
    currency: single?.currency ?? null,
  };
}

export function getCommonCurrency(accounts: WealthSummaryAccount[]): string | null {
  const currencies = new Set(accounts.map((account) => normalizeCurrency(account.currency)));
  return currencies.size === 1 ? [...currencies][0] : null;
}

export interface WealthReminderAccount {
  id: string;
  name: string;
  type: string;
  dueDate?: number | null;
  expiryDate?: Date | string | null;
}

export function getUpcomingReminders(accounts: WealthReminderAccount[], today = new Date()) {
  return accounts
    .filter((account) => {
      if (account.type === "CREDIT_CARD" && account.dueDate) {
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const dueDay = Math.min(account.dueDate, daysInMonth);
        const currentDay = today.getDate();
        const daysUntilDue =
          dueDay >= currentDay ? dueDay - currentDay : daysInMonth - currentDay + dueDay;
        return daysUntilDue <= 7;
      }

      if (account.expiryDate) {
        const expiry = new Date(account.expiryDate);
        if (Number.isNaN(expiry.getTime())) return false;
        const daysUntilExpiry = Math.ceil(
          (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return daysUntilExpiry <= 30;
      }

      return false;
    })
    .map((account) => ({
      accountId: account.id,
      accountName: account.name,
      type: account.type,
      reminderType: account.type === "CREDIT_CARD" ? "PAYMENT_DUE" : "EXPIRY",
      dueDate: account.dueDate ?? account.expiryDate ?? null,
    }));
}

const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 100;

export function normalizeOptionalString(
  value: unknown,
  maxLength = MAX_STRING_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function normalizeStringArray(
  value: unknown,
  maxItemLength = MAX_STRING_LENGTH,
  maxItems = MAX_ARRAY_ITEMS,
): string[] {
  if (Array.isArray(value)) {
    return value
      .slice(0, maxItems)
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (typeof item === "number" || typeof item === "boolean") return String(item).trim();
        return "";
      })
      .filter((item) => item.length > 0)
      .map((item) => (item.length > maxItemLength ? item.slice(0, maxItemLength) : item));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .slice(0, maxItems)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => (item.length > maxItemLength ? item.slice(0, maxItemLength) : item));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    const str = String(value).trim();
    if (str.length === 0) return [];
    return [str.length > maxItemLength ? str.slice(0, maxItemLength) : str];
  }

  return [];
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseNotifyDays(value: unknown, defaultDays: number[] = [7, 3, 1, 0]): number[] {
  if (value === null || value === undefined) {
    return defaultDays;
  }

  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
      .filter((v) => Number.isInteger(v) && v >= 0 && v <= 365);
  }

  if (typeof value === "string") {
    if (!value.trim()) return [];
    return value
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => Number.isInteger(v) && v >= 0 && v <= 365);
  }

  return defaultDays;
}

export function isValidCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]{3}$/.test(value.trim());
}

export function normalizeCurrency(value: unknown, fallback = "INR"): string {
  if (isValidCurrency(value)) {
    return value.trim().toUpperCase();
  }
  if (value !== null && value !== undefined && value !== "" && value !== fallback) {
    console.warn(
      `[Wealth] Invalid currency "${String(value)}" provided; falling back to ${fallback}.`,
    );
  }

  return fallback;
}

export function isValidTenureMonths(tenure: unknown): boolean {
  if (typeof tenure !== "number" || !Number.isInteger(tenure)) return false;
  return tenure >= 1 && tenure <= 1200;
}

export function validateDueDate(
  dueDate: number | null,
  contextDate?: Date | null,
): { valid: boolean; error?: string } {
  if (dueDate === null) return { valid: true };
  if (!Number.isInteger(dueDate) || dueDate < 1 || dueDate > 31) {
    return { valid: false, error: "Due date must be a day between 1 and 31." };
  }
  if (contextDate && !Number.isNaN(contextDate.getTime())) {
    const daysInMonth = new Date(
      contextDate.getFullYear(),
      contextDate.getMonth() + 1,
      0,
    ).getDate();
    if (dueDate > daysInMonth) {
      const monthName = contextDate.toLocaleString("en-US", { month: "long" });
      return {
        valid: false,
        error: `Due date ${dueDate} is invalid for ${monthName} (has ${daysInMonth} days).`,
      };
    }
  }
  return { valid: true };
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin.trim());
}

export function isValidAccountNumber(accountNumber: string): boolean {
  const trimmed = accountNumber.trim();
  return trimmed.length >= 4 && trimmed.length <= 34 && /^[a-zA-Z0-9\s-]+$/.test(trimmed);
}

export function isValidInterestRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

export function withoutPin<T extends { pin?: string | null }>(account: T): Omit<T, "pin"> {
  const safeAccount = { ...account };
  delete safeAccount.pin;
  return safeAccount;
}

export function formatCurrency(
  amount: unknown,
  currency = "INR",
  maximumFractionDigits = 0,
): string {
  const numericAmount = Number(amount) || 0;
  const safeCurrency = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "INR";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits,
    }).format(numericAmount);
  } catch {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits,
    }).format(numericAmount);
  }
}
