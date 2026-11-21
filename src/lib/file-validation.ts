import { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } from "@/lib/constants";

export { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } from "@/lib/constants";

export function validateFileTypeAndExtension(
  filename: string,
  mimeType: string,
): { valid: boolean; error?: string } {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";

  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Invalid or missing file extension (${ext || "none"}). Only PDF, JPEG, PNG, and WebP files are allowed.`,
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid file format (${mimeType}). Only PDF, JPEG, PNG, and WebP files are allowed.`,
    };
  }

  return { valid: true };
}

export function getMaxUploadSize(): number {
  const envLimit = process.env.MAX_UPLOAD_SIZE;
  if (envLimit && !isNaN(Number(envLimit))) {
    return Number(envLimit);
  }
  return 52428800; // Default 50MB
}
