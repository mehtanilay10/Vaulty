import { getProviderForUser, getProviderForDocument } from "@/lib/storage/factory";
import { processDocumentWithGemini } from "@/lib/gemini";
import { getFolderHierarchyPath } from "@/lib/folder-path";
import { AiErrorCode, classifyAiError } from "./error-codes";

export interface AiProcessingResult {
  extractedText: string;
  summaryMarkdown: string;
  interpretationMarkdown: string;
  documentMetadata: {
    documentType: string | null;
    expiryDate: string | null;
    expiryDateConfidence: number;
    expiryDateEvidence: string | null;
    importantDates: Array<{
      type: string;
      date: string;
      confidence: number;
      evidence: string | null;
    }>;
  };
  textFileId: string | null;
  summaryFileId: string | null;
  interpretationFileId: string | null;
}

export async function runAiProcessingPipeline(params: {
  documentId: string;
  ownerId: string;
  mimeType: string;
  fileName: string;
  storageProvider: string;
  storageFileId: string | null | undefined;
  folderId?: string | null;
}): Promise<AiProcessingResult> {
  const { documentId, ownerId, mimeType, fileName, storageProvider, storageFileId, folderId } =
    params;

  let fileBuffer: Buffer;
  try {
    if (
      storageProvider === "GOOGLE_DRIVE" &&
      typeof storageFileId === "string" &&
      storageFileId.trim().length > 0
    ) {
      const { provider } = await getProviderForDocument({
        id: documentId,
        storageProvider,
        storageFileId: storageFileId.trim(),
        ownerId,
        folderId: folderId || "",
      });
      fileBuffer = await provider.downloadFile(storageFileId.trim());
    } else {
      throw new Error(
        `Document storage not available for AI processing. storageProvider=${storageProvider}, storageFileId=${storageFileId}`,
      );
    }
  } catch (err) {
    const { code } = classifyAiError(err);
    throw { code, message: err instanceof Error ? err.message : String(err) } as {
      code: AiErrorCode;
      message: string;
    };
  }

  const geminiResult = await processDocumentWithGemini(fileBuffer, mimeType, fileName);

  let textFileId: string | null = null;
  let summaryFileId: string | null = null;
  let interpretationFileId: string | null = null;

  try {
    const { provider } = await getProviderForUser(ownerId, "GOOGLE_DRIVE");
    const vaultyFolders = await provider.ensureVaultyFolders();
    const baseName = fileName.replace(/[/\\?%*:|"<>]/g, "_");

    const folderPath =
      folderId && typeof folderId === "string" && folderId.trim().length > 0
        ? await getFolderHierarchyPath(folderId.trim())
        : [];

    const textParentId =
      folderPath.length > 0
        ? await provider.createFolderPath(folderPath, vaultyFolders.text)
        : vaultyFolders.text;

    const summaryParentId =
      folderPath.length > 0
        ? await provider.createFolderPath(folderPath, vaultyFolders.summary)
        : vaultyFolders.summary;

    const interpretationParentId =
      folderPath.length > 0
        ? await provider.createFolderPath(folderPath, vaultyFolders.interpretation)
        : vaultyFolders.interpretation;

    const textUpload = await provider.uploadFile({
      filename: `${baseName}.txt`,
      mimeType: "text/plain",
      data: Buffer.from(geminiResult.extractedText),
      parentId: textParentId,
    });
    textFileId = textUpload.id;

    const summaryUpload = await provider.uploadFile({
      filename: `${baseName}.md`,
      mimeType: "text/markdown",
      data: Buffer.from(geminiResult.summaryMarkdown),
      parentId: summaryParentId,
    });
    summaryFileId = summaryUpload.id;

    const interpretationUpload = await provider.uploadFile({
      filename: `${baseName}.md`,
      mimeType: "text/markdown",
      data: Buffer.from(geminiResult.interpretationMarkdown),
      parentId: interpretationParentId,
    });
    interpretationFileId = interpretationUpload.id;
  } catch (err) {
    console.error("Failed to upload AI files to Google Drive:", err);
    const { code } = classifyAiError(err);
    throw {
      code: code === AiErrorCode.UNKNOWN ? AiErrorCode.UPLOAD_ERROR : code,
      message: `Failed to upload AI-generated files to Google Drive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    extractedText: geminiResult.extractedText,
    summaryMarkdown: geminiResult.summaryMarkdown,
    interpretationMarkdown: geminiResult.interpretationMarkdown,
    documentMetadata: geminiResult.documentMetadata,
    textFileId,
    summaryFileId,
    interpretationFileId,
  };
}
