import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PDF_PERSONAL_FIELDS } from "@/lib/constants";

export { PDF_PERSONAL_FIELDS, PDF_TEMPLATE_TOKENS } from "@/lib/constants";
export type PdfPersonalField = (typeof PDF_PERSONAL_FIELDS)[number];
export type PdfPasswordConfig = {
  values: Partial<Record<PdfPersonalField, string>> & Record<string, string>;
  customValues: Record<string, string>;
  templates: Array<{ id: string; institution: string; pattern: string; enabled: boolean }>;
};

const EMPTY_CONFIG: PdfPasswordConfig = { values: {}, customValues: {}, templates: [] };

function encryptionKey() {
  const secret = process.env.PDF_PASSWORD_SETTINGS_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "A dedicated PDF_PASSWORD_SETTINGS_SECRET (32+ characters) or AUTH_SECRET is required.",
    );
  }
  return createHash("sha256").update(`vaulty:pdf-password-settings:v1:${secret}`).digest();
}

function encryptConfig(config: PdfPasswordConfig) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptConfig(value: string): PdfPasswordConfig {
  try {
    const [version, iv, tag, ciphertext] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext)
      throw new Error("Unsupported PDF settings encryption format.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const parsed = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
    const cleanMap = (input: unknown, allowed?: RegExp) => {
      const output: Record<string, string> = {};
      if (!input || typeof input !== "object" || Array.isArray(input)) return output;
      for (const [key, item] of Object.entries(input)) {
        if ((!allowed || allowed.test(key)) && typeof item === "string" && item.length <= 128)
          output[key] = item;
      }
      return output;
    };
    return {
      values: cleanMap(
        parsed.values,
        /^(firstName|lastName|mobile|dateOfBirth|pan)$/,
      ) as PdfPasswordConfig["values"],
      customValues: cleanMap(parsed.customValues, /^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/),
      templates: Array.isArray(parsed.templates)
        ? parsed.templates
            .filter((item: unknown): item is PdfPasswordConfig["templates"][number] => {
              if (!item || typeof item !== "object" || Array.isArray(item)) return false;
              const candidate = item as Record<string, unknown>;
              return (
                typeof candidate.id === "string" &&
                typeof candidate.institution === "string" &&
                typeof candidate.pattern === "string" &&
                typeof candidate.enabled === "boolean" &&
                candidate.id.length <= 64 &&
                candidate.institution.length <= 100 &&
                candidate.pattern.length <= 128
              );
            })
            .slice(0, 30)
            .map((item: PdfPasswordConfig["templates"][number]) => ({
              id: item.id,
              institution: item.institution,
              pattern: item.pattern,
              enabled: item.enabled,
            }))
        : [],
    };
  } catch (error) {
    console.error("[pdf-passwords] Failed to decrypt PDF password config:", error);
    return structuredClone(EMPTY_CONFIG);
  }
}

export async function getPdfPasswordConfig(userId: string): Promise<PdfPasswordConfig> {
  const row = await prisma.pdfPasswordSettings.findUnique({
    where: { userId },
    select: { encryptedConfig: true },
  });
  return row ? decryptConfig(row.encryptedConfig) : structuredClone(EMPTY_CONFIG);
}

export async function savePdfPasswordConfig(userId: string, config: PdfPasswordConfig) {
  const encryptedConfig = encryptConfig(config);
  await prisma.pdfPasswordSettings.upsert({
    where: { userId },
    create: { userId, encryptedConfig },
    update: { encryptedConfig },
  });
}

export function maskPdfPersonalValues(config: PdfPasswordConfig) {
  const masked: Record<string, string | null> = {};
  for (const field of PDF_PERSONAL_FIELDS) {
    const value = config.values[field] || "";
    masked[field] = value
      ? `${"•".repeat(Math.min(8, Math.max(4, value.length - 2)))}${value.slice(-2)}`
      : null;
  }
  for (const [key, value] of Object.entries(config.customValues)) {
    masked[`custom:${key}`] = value
      ? `${"•".repeat(Math.min(8, Math.max(4, value.length - 2)))}${value.slice(-2)}`
      : null;
  }
  return masked;
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function generatePdfPasswordCandidates(
  config: PdfPasswordConfig,
  institution: string,
  hintText = "",
): string[] {
  const normalizedInstitution = normalize(institution);
  const matching = config.templates
    .filter((template) => {
      const templateInstitution = normalize(template.institution);
      return (
        template.enabled &&
        (templateInstitution === "DEFAULT" ||
          Boolean(
            normalizedInstitution &&
            (normalizedInstitution.includes(templateInstitution) ||
              templateInstitution.includes(normalizedInstitution)),
          ))
      );
    })
    .sort(
      (a, b) =>
        Number(normalize(a.institution) === "DEFAULT") -
        Number(normalize(b.institution) === "DEFAULT"),
    );
  const candidates: string[] = [];
  const values: Record<string, string> = {
    ...config.values,
    ...config.customValues,
  };
  for (const template of matching) {
    const tokenNames = [...template.pattern.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g)].map(
      (match) => match[1],
    );
    if (tokenNames.some((key) => !values[key])) continue;
    const candidate = template.pattern.replace(
      /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g,
      (_, key: string) => values[key] || "",
    );
    if (candidate.length >= 4 && candidate.length <= 64) candidates.push(candidate);
  }
  // Password hints in the email are considered only if they look like an explicit hint.
  const hintPattern =
    /(?:pdf|statement|document)(?:\s+pdf)?\s*(?:password|pwd|passcode)\s*(?:is|:|=|-)\s*([A-Za-z0-9@#$%._-]{4,32})/gi;
  const hintPlaceholders = new Set([
    "YOUR",
    "DOB",
    "PAN",
    "MOBILE",
    "DATE",
    "BIRTH",
    "REGISTERED",
    "PASSWORD",
  ]);
  for (const match of hintText.matchAll(hintPattern)) {
    const hint = match[1]?.trim().replace(/[.,;:]+$/, "");
    if (hint && !hintPlaceholders.has(hint.toUpperCase())) candidates.unshift(hint);
  }
  return [...new Set(candidates)].slice(0, 8);
}
