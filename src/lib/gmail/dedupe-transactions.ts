export interface TransactionFingerprint {
  amount: unknown;
  currency: string;
  type: string;
  date: Date | string;
  referenceNumber?: string | null;
  bankName?: string | null;
  merchant?: string | null;
  description?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 100);
}

function transactionTypeBucket(value: string): string {
  const type = value.toUpperCase();
  if (["WITHDRAWAL", "PURCHASE", "PAYMENT", "FEE", "TRANSFER_OUT"].includes(type)) return "DEBIT";
  if (["DEPOSIT", "SALE", "INTEREST", "DIVIDEND", "REFUND", "TRANSFER_IN"].includes(type))
    return "CREDIT";
  return type;
}

/** Match repeated alerts/statements without treating every same-value purchase as a duplicate. */
export function areDuplicateTransactions(
  a: TransactionFingerprint,
  b: TransactionFingerprint,
): boolean {
  if (a.currency.toUpperCase() !== b.currency.toUpperCase()) return false;
  if (transactionTypeBucket(String(a.type)) !== transactionTypeBucket(String(b.type))) return false;
  if (Math.round(Number(a.amount) * 100) !== Math.round(Number(b.amount) * 100)) return false;

  const aDate = new Date(a.date).getTime();
  const bDate = new Date(b.date).getTime();
  if (!Number.isFinite(aDate) || !Number.isFinite(bDate)) return false;
  if (Math.abs(aDate - bDate) > 48 * 60 * 60 * 1000) return false;

  const aRef = normalize(a.referenceNumber);
  const bRef = normalize(b.referenceNumber);
  if (aRef && bRef) return aRef === bRef;

  const aParty = normalize(a.merchant || a.description);
  const bParty = normalize(b.merchant || b.description);
  const aBank = normalize(a.bankName);
  const bBank = normalize(b.bankName);
  const partyMatches = Boolean(
    aParty &&
    bParty &&
    (aParty === bParty ||
      (Math.min(aParty.length, bParty.length) >= 4 &&
        (aParty.includes(bParty) || bParty.includes(aParty)))),
  );
  const bankMatches =
    !aBank ||
    !bBank ||
    aBank === bBank ||
    (Math.min(aBank.length, bBank.length) >= 4 && (aBank.includes(bBank) || bBank.includes(aBank)));
  return partyMatches && bankMatches;
}

export function removeDuplicateTransactions<T extends TransactionFingerprint>(
  candidates: T[],
  existing: TransactionFingerprint[],
): T[] {
  const accepted: T[] = [];
  for (const candidate of candidates) {
    if (existing.some((item) => areDuplicateTransactions(candidate, item))) continue;
    if (accepted.some((item) => areDuplicateTransactions(candidate, item))) continue;
    accepted.push(candidate);
  }
  return accepted;
}
