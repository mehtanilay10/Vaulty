import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { processDocumentWithGemini } from "@/lib/gemini";
import { generatePdfPasswordCandidates, getPdfPasswordConfig } from "@/lib/pdf-passwords";
import { extractPdfText } from "@/lib/email-statement-attachments";

const ALLOWED_MIME_TYPES = [
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
];

const ALLOWED_EXTENSIONS = [".txt", ".csv", ".xls", ".xlsx", ".pdf"];

function validateFileType(filename: string, mimeType: string): { valid: boolean; error?: string } {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file extension (${ext}). Only text, CSV, Excel, and PDF files are allowed.`,
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid file format (${mimeType}). Only text, CSV, Excel, and PDF files are allowed.`,
    };
  }

  return { valid: true };
}

async function parseTextFile(buffer: Buffer): Promise<string> {
  return buffer.toString("utf-8");
}

async function parseCSVFile(buffer: Buffer): Promise<string> {
  return buffer.toString("utf-8");
}

async function parseExcelFile(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return XLSX.utils.sheet_to_csv(sheet);
  });
  return sheets.join("\n\n---SHEET---\n\n");
}

async function parsePDFFile(
  buffer: Buffer,
  filename: string,
  userId: string,
  password?: string,
): Promise<string> {
  const extractPdf = (pwd?: string) => extractPdfText(buffer, pwd);

  if (password) {
    try {
      return await extractPdf(password);
    } catch (error) {
      throw new Error(
        `Failed to decrypt PDF with provided password: ${error instanceof Error ? error.message : "Invalid password"}`,
      );
    }
  }

  try {
    const text = await extractPdf();
    if (text.trim().length > 0) {
      return text;
    }
    // Fall back to Gemini for scanned/image-only PDFs
    const result = await processDocumentWithGemini(buffer, "application/pdf", filename);
    return result.extractedText;
  } catch (firstError) {
    const message = firstError instanceof Error ? firstError.message : "";
    const isEncrypted = /password|encrypt/i.test(message);

    if (isEncrypted) {
      try {
        const config = await getPdfPasswordConfig(userId);
        const candidates = generatePdfPasswordCandidates(config, filename);
        for (const candidate of candidates) {
          try {
            return await extractPdf(candidate);
          } catch {
            // Never log or expose candidate passwords
          }
        }
      } catch {
        // Ignore password config lookup errors
      }

      throw new Error(
        "This PDF is password-protected. Please enter the password to decrypt and extract transactions.",
      );
    }

    const result = await processDocumentWithGemini(buffer, "application/pdf", filename);
    return result.extractedText;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const password = formData.get("password") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const validation = validateFileType(file.name, file.type);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds maximum limit of 50MB.` },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    let extractedText = "";
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    try {
      if (ext === ".pdf") {
        extractedText = await parsePDFFile(fileBuffer, file.name, user.id, password || undefined);
      } else if (ext === ".xls" || ext === ".xlsx") {
        extractedText = await parseExcelFile(fileBuffer);
      } else if (ext === ".csv") {
        extractedText = await parseCSVFile(fileBuffer);
      } else {
        extractedText = await parseTextFile(fileBuffer);
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to process file." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      content: extractedText,
      filename: file.name,
      format: ext === ".csv" ? "csv" : "text",
    });
  } catch (error) {
    console.error("POST /api/wealth/statements/upload error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during file upload." },
      { status: 500 },
    );
  }
}
