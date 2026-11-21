import { setVapidDetails, sendNotification } from "web-push";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { MAX_PUSH_ENDPOINT_LENGTH } from "@/lib/constants";

function pushEncryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "AUTH_SECRET must contain at least 32 characters to protect push subscriptions.",
    );
  return createHash("sha256").update(`vaulty:web-push-subscription:v1:${secret}`).digest();
}

export function encryptPushSecret(value: string) {
  if (value.startsWith("enc:v1:")) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pushEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptPushSecret(value: string) {
  if (!value.startsWith("enc:v1:")) {
    throw new Error("Invalid or unencrypted push subscription secret.");
  }
  try {
    const [, version, iv, tag, ciphertext] = value.split(":");
    if (version !== "v1" || !iv || !tag || !ciphertext)
      throw new Error("Invalid encrypted push subscription key.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      pushEncryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    console.error("[web-push] Failed to decrypt push secret:", error);
    throw error;
  }
}

/**
 * Accept only HTTPS push service URLs. Browser subscriptions are untrusted
 * input, so reject credentials, non-standard ports, IP literals and local hosts.
 * The endpoint is sent only to the Web Push provider by the web-push package.
 */
export function isValidPushEndpoint(value: string): boolean {
  try {
    if (!value || value.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.hash &&
      isIP(hostname) === 0 &&
      hostname.includes(".") &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

export function getVapidPublicKey(): string | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return publicKey && process.env.VAPID_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT
    ? publicKey
    : null;
}

function configureVapid(): void {
  const subject = process.env.WEB_PUSH_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error("Web Push VAPID keys are not configured.");
  }

  setVapidDetails(subject, publicKey, privateKey);
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<{ sent: number; failed: number }> {
  if (!getVapidPublicKey()) return { sent: 0, failed: 0 };

  configureVapid();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (!isValidPushEndpoint(subscription.endpoint)) {
        failed += 1;
        await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        return;
      }

      let p256dh: string;
      let auth: string;
      try {
        p256dh = decryptPushSecret(subscription.p256dh);
        auth = decryptPushSecret(subscription.auth);
      } catch {
        failed += 1;
        console.error(
          "[web-push] Failed to decrypt subscription keys; removing invalidated push subscription.",
        );
        await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        return;
      }

      try {
        await sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh,
              auth,
            },
          },
          JSON.stringify({
            ...payload,
            icon: "/vaulty-icon.svg",
            badge: "/favicon.svg",
          }),
          { TTL: 86400, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        } else {
          console.error(
            "[web-push] delivery failed",
            statusCode ?? (error instanceof Error ? error.message : "unknown error"),
          );
        }
      }
    }),
  );

  return { sent, failed };
}
