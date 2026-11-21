export interface ReminderItemFingerprint {
  title: string;
  dueAt: Date | string;
  amount?: unknown;
  currency?: string | null;
  category?: string | null;
}

export interface DocumentItemFingerprint {
  documentTitle: string;
  documentType: string;
  expiryDate?: Date | string | null;
  receivedAt?: Date | string;
}

export function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 100);
}

export function areDuplicateReminders(
  a: ReminderItemFingerprint,
  b: ReminderItemFingerprint,
): boolean {
  const normA = normalizeText(a.title);
  const normB = normalizeText(b.title);
  if (!normA || !normB) return false;

  const titleMatches =
    normA === normB ||
    (Math.min(normA.length, normB.length) >= 4 && (normA.includes(normB) || normB.includes(normA)));

  if (!titleMatches) return false;

  const timeA = new Date(a.dueAt).getTime();
  const timeB = new Date(b.dueAt).getTime();
  if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
    // Due dates within 2 days of each other are considered the same reminder cycle
    const diffDays = Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);
    if (diffDays > 2) return false;
  }

  // If both have amounts, verify they are compatible
  if (a.amount != null && b.amount != null) {
    if (Math.round(Number(a.amount) * 100) !== Math.round(Number(b.amount) * 100)) {
      return false;
    }
  }

  return true;
}

export function areDuplicateDocuments(
  a: DocumentItemFingerprint,
  b: DocumentItemFingerprint,
): boolean {
  const normA = normalizeText(a.documentTitle);
  const normB = normalizeText(b.documentTitle);
  if (!normA || !normB) return false;

  const titleMatches =
    normA === normB ||
    (Math.min(normA.length, normB.length) >= 4 && (normA.includes(normB) || normB.includes(normA)));

  if (!titleMatches) return false;

  // Check document type if both provided
  if (a.documentType && b.documentType) {
    const typeA = normalizeText(a.documentType);
    const typeB = normalizeText(b.documentType);
    if (typeA && typeB && typeA !== typeB && !typeA.includes(typeB) && !typeB.includes(typeA)) {
      return false;
    }
  }

  // If received dates are provided, ensure they are within 14 days
  if (a.receivedAt && b.receivedAt) {
    const timeA = new Date(a.receivedAt).getTime();
    const timeB = new Date(b.receivedAt).getTime();
    if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
      const diffDays = Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);
      if (diffDays > 14) return false;
    }
  }

  return true;
}

/**
 * Filter out duplicates from a list of candidates against existing items and accepted candidates.
 */
export function removeDuplicateReminders<T extends ReminderItemFingerprint>(
  candidates: T[],
  existing: ReminderItemFingerprint[],
): T[] {
  const accepted: T[] = [];
  for (const candidate of candidates) {
    if (existing.some((item) => areDuplicateReminders(candidate, item))) continue;
    if (accepted.some((item) => areDuplicateReminders(candidate, item))) continue;
    accepted.push(candidate);
  }
  return accepted;
}

export function removeDuplicateDocuments<T extends DocumentItemFingerprint>(
  candidates: T[],
  existing: DocumentItemFingerprint[],
): T[] {
  const accepted: T[] = [];
  for (const candidate of candidates) {
    if (existing.some((item) => areDuplicateDocuments(candidate, item))) continue;
    if (accepted.some((item) => areDuplicateDocuments(candidate, item))) continue;
    accepted.push(candidate);
  }
  return accepted;
}

/**
 * Club an array of items, keeping the one with higher confidence or latest timestamp from each duplicate cluster.
 */
export function clubReminders<
  T extends ReminderItemFingerprint & { id?: string; aiConfidence?: number | null },
>(items: T[]): T[] {
  const clubbed: T[] = [];
  for (const item of items) {
    const existingIndex = clubbed.findIndex((c) => areDuplicateReminders(item, c));
    if (existingIndex === -1) {
      clubbed.push(item);
    } else {
      // Keep whichever has higher confidence
      if ((item.aiConfidence ?? 0) > (clubbed[existingIndex].aiConfidence ?? 0)) {
        clubbed[existingIndex] = item;
      }
    }
  }
  return clubbed;
}

export function clubDocuments<
  T extends DocumentItemFingerprint & { id?: string; aiConfidence?: number | null },
>(items: T[]): T[] {
  const clubbed: T[] = [];
  for (const item of items) {
    const existingIndex = clubbed.findIndex((c) => areDuplicateDocuments(item, c));
    if (existingIndex === -1) {
      clubbed.push(item);
    } else {
      if ((item.aiConfidence ?? 0) > (clubbed[existingIndex].aiConfidence ?? 0)) {
        clubbed[existingIndex] = item;
      }
    }
  }
  return clubbed;
}
