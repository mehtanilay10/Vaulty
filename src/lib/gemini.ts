import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const ai = new GoogleGenAI({ apiKey });

export interface GeminiProcessResult {
  extractedText: string;
  summaryMarkdown: string;
  interpretationMarkdown: string;
}

const SYSTEM_PROMPT = `
You are an expert, objective document analyst for Vaulty, a private personal document vault.
Your task is to analyze the provided document (PDF or image) and output a JSON response containing three fields:
1. "extractedText": Complete, verbatim text extracted from the document. Preserve numbers, dates, medical values, names, units, and formatting layout as accurately as possible.
2. "summaryMarkdown": A clear, structured Markdown summary of the document. Use section headings like "## Document Summary", "## Key Details", and bullet points.
3. "interpretationMarkdown": Helpful informational interpretation of what the document indicates or means.

CRITICAL RULES AND MANDATES:
- DO NOT invent, fabricate, or hallucinate facts, dates, names, or values.
- IF information is missing or unclear, explicitly state that it is not present in the document.
- FOR MEDICAL DOCUMENTS: Provide informational interpretation ONLY. Do NOT claim to be a doctor or make a diagnosis. Do NOT suggest stopping or altering medications. Include a brief medical disclaimer note.
- Preserve exact numerical values, units, and abnormal findings.
- Format all outputs strictly as JSON adhering to the specified schema.
`;

export async function processDocumentWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<GeminiProcessResult> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const base64Data = fileBuffer.toString("base64");

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Analyze this document named "${filename}". Provide the extracted text, Markdown summary, and Markdown interpretation strictly in JSON schema format.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extractedText: { type: Type.STRING },
          summaryMarkdown: { type: Type.STRING },
          interpretationMarkdown: { type: Type.STRING },
        },
        required: ["extractedText", "summaryMarkdown", "interpretationMarkdown"],
      },
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error("Empty response received from Gemini API.");
  }

  const parsed = JSON.parse(responseText) as GeminiProcessResult;
  return {
    extractedText: parsed.extractedText || "",
    summaryMarkdown: parsed.summaryMarkdown || "## Summary\n\nNo summary available.",
    interpretationMarkdown: parsed.interpretationMarkdown || "No interpretation available.",
  };
}
