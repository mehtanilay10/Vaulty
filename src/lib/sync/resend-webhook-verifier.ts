import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifyResendWebhookOptions {
  secret: string;
  payload: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  toleranceSeconds?: number;
}

/**
 * Verifies the Svix webhook signature sent by Resend inbound webhooks.
 * Uses timing-safe comparisons and replay-attack timestamp tolerance checks.
 */
export function verifyResendWebhookSignature(options: VerifyResendWebhookOptions): boolean {
  const { secret, payload, svixId, svixTimestamp, svixSignature, toleranceSeconds = 300 } = options;

  if (!secret || !payload || !svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Verify timestamp freshness
  const timestampNum = parseInt(svixTimestamp, 10);
  if (isNaN(timestampNum)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > toleranceSeconds) {
    return false;
  }

  // Svix secret keys start with "whsec_" and are base64 encoded
  const rawKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBuffer: Buffer;
  try {
    keyBuffer = Buffer.from(rawKey, "base64");
  } catch {
    return false;
  }

  const toSign = `${svixId}.${svixTimestamp}.${payload}`;
  const expectedSignature = createHmac("sha256", keyBuffer).update(toSign).digest("base64");
  const expectedBuf = Buffer.from(expectedSignature);

  // svix-signature header can contain multiple space-separated signatures e.g. "v1,abc v1,def"
  const candidateSignatures = svixSignature.split(" ");
  for (const candidate of candidateSignatures) {
    const [version, signature] = candidate.split(",");
    if (version === "v1" && signature) {
      const candidateBuf = Buffer.from(signature);
      if (
        candidateBuf.length === expectedBuf.length &&
        timingSafeEqual(candidateBuf, expectedBuf)
      ) {
        return true;
      }
    }
  }

  return false;
}
