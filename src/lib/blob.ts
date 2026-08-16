import { put, del } from "@vercel/blob";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export function validateFileTypeAndExtension(filename: string, mimeType: string): { valid: boolean; error?: string } {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Invalid file extension (${ext}). Only PDF, JPEG, PNG, and WebP files are allowed.` };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: `Invalid file format (${mimeType}). Only PDF, JPEG, PNG, and WebP files are allowed.` };
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

export async function uploadPrivateBlob(
  filename: string,
  fileData: Buffer | Blob,
  customPath?: string
) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  
  const blobPathname = customPath || `vaulty-docs/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  
  const blob = await put(blobPathname, fileData, {
    access: "private",
    token: blobToken,
    addRandomSuffix: false, // Ensure exact hierarchy path
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

export async function deletePrivateBlob(url: string) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (url) {
    try {
      await del(url, { token: blobToken });
    } catch (err) {
      console.error("Error deleting Vercel Blob:", err);
    }
  }
}
