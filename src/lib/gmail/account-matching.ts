export interface FinancialAccountMatchCandidate {
  id: string;
  bankName?: string | null;
  provider?: string | null;
  name: string;
  accountNumber?: string | null;
}

/** Extract a full account/card number locally when explicitly labeled. Never log or persist it. */
export function extractAccountNumberHint(text: string): string | null {
  const patterns = [
    /(?:a\/c|account|acct|card)\s*(?:no\.?|number|#)?\s*[:#-]?\s*((?:[x*]{2,})?[0-9][0-9\s-]{4,22})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const digits = match?.[1]?.replace(/\D/g, "") || "";
    if (digits.length >= 6 && digits.length <= 22) return digits;
  }
  return null;
}

/** Extract a last-four hint locally; never send this value as a separate AI field. */
export function extractAccountLastFour(text: string): string | null {
  const patterns = [
    /(?:a\/c|account|acct|card)(?:\s*(?:no\.?|number|ending|xx|\*+))?\s*[:#-]?\s*(?:x{2,}|\*{2,}|\d{0,12})?(\d{4})\b/i,
    /(?:ending|last\s*4|xxxx|\*{4})\s*(\d{4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function matchFinancialAccount(
  accounts: FinancialAccountMatchCandidate[],
  bankName: string | null,
  lastFour: string | null,
  fullAccountNumber: string | null = null,
): string | null {
  if (!bankName && !lastFour) return null;
  const normalizedBank = (bankName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const matches = accounts.filter((account) => {
    const number = (account.accountNumber || "").replace(/\D/g, "");
    const digitsMatch = Boolean(
      (fullAccountNumber && number === fullAccountNumber.replace(/\D/g, "")) ||
      (lastFour && number.endsWith(lastFour)),
    );
    const accountBank = `${account.bankName || ""} ${account.provider || ""} ${account.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const bankMatch = Boolean(
      normalizedBank &&
      (accountBank.includes(normalizedBank) || normalizedBank.includes(accountBank)),
    );
    if (lastFour) return digitsMatch && (!normalizedBank || bankMatch);
    if (fullAccountNumber) return digitsMatch && (!normalizedBank || bankMatch);
    return bankMatch;
  });
  return matches.length === 1 ? matches[0].id : null;
}
