import { UUID_REGEX } from "@/lib/constants";

export { UUID_REGEX } from "@/lib/constants";

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateUUID(value: string, fieldName = "ID"): void {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid ${fieldName} format`);
  }
}
