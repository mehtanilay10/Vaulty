import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import {
  getPdfPasswordConfig,
  savePdfPasswordConfig,
  maskPdfPersonalValues,
  PDF_PERSONAL_FIELDS,
} from "@/lib/pdf-passwords";

const schema = z
  .object({
    values: z.record(z.string(), z.string().max(128)).optional(),
    customValues: z
      .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/), z.string().max(128))
      .optional(),
    templates: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            institution: z.string().min(1).max(100),
            pattern: z
              .string()
              .min(1)
              .max(128)
              .refine((pattern) => {
                const literals = pattern
                  .replace(/\{\{\s*[a-zA-Z0-9_-]+\s*\}\}/g, "")
                  .replace(/[\s._\-@#$%+/:]/g, "");
                return literals.length === 0;
              }, "Templates may combine tokens and separators, not literal personal values."),
            enabled: z.boolean().default(true),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    clearFields: z.array(z.string()).max(50).optional(),
  })
  .strict();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = await getPdfPasswordConfig(user.id);
    return NextResponse.json({
      values: maskPdfPersonalValues(config),
      templates: config.templates,
      supportedTokens: [...PDF_PERSONAL_FIELDS, ...Object.keys(config.customValues)],
    });
  } catch {
    return NextResponse.json(
      { error: "PDF password settings are not available. Check server encryption configuration." },
      { status: 503 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validateCSRFRequest(req))
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid PDF password settings." }, { status: 400 });
  try {
    const current = await getPdfPasswordConfig(user.id);
    const values = { ...current.values };
    const customValues = { ...current.customValues };
    for (const field of PDF_PERSONAL_FIELDS) {
      const value = parsed.data.values?.[field];
      if (typeof value === "string" && value.trim()) values[field] = value.trim();
    }
    for (const [key, value] of Object.entries(parsed.data.customValues || {})) {
      if (value.trim()) customValues[key] = value.trim();
    }
    for (const field of parsed.data.clearFields || []) {
      if (field.startsWith("custom:")) delete customValues[field.slice(7)];
      else if ((PDF_PERSONAL_FIELDS as readonly string[]).includes(field)) delete values[field];
    }
    const templates = (parsed.data.templates || current.templates).map((template) => ({
      ...template,
      institution: template.institution.trim().slice(0, 100),
      pattern: template.pattern.trim(),
    }));
    await savePdfPasswordConfig(user.id, { values, customValues, templates });
    return NextResponse.json({
      success: true,
      values: maskPdfPersonalValues({ values, customValues, templates }),
      templates,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not securely save PDF password settings." },
      { status: 503 },
    );
  }
}
