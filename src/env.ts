import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    AUTH_SECRET: z
      .string()
      .min(32, "AUTH_SECRET must be at least 32 characters in length")
      .optional(),
    CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 characters").optional(),
    CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters").optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    DEV_LOGIN_EMAIL: z.string().email().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_INBOUND_WEBHOOK_SECRET: z.string().optional(),
    INBOUND_EMAIL_DOMAIN: z.string().optional().default("vaulty.mnilay.com"),
    EMAIL_FROM: z.string().optional(),
    GEMINI_API_KEY_1: z.string().optional(),
    GEMINI_API_KEY_2: z.string().optional(),
    GEMINI_API_KEY_3: z.string().optional(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    WEB_PUSH_SUBJECT: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_SECRET"],
          message: "AUTH_SECRET must be configured with at least 32 characters in production.",
        });
      }
      if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["CRON_SECRET"],
          message: "CRON_SECRET must be configured with at least 32 characters in production.",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

export function validateEnv(): Env {
  if (parsedEnv) return parsedEnv;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment configuration:", result.error.format());
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Invalid environment configuration: ${JSON.stringify(result.error.flatten().fieldErrors)}`,
      );
    }
    parsedEnv = process.env as unknown as Env;
    return parsedEnv;
  }
  parsedEnv = result.data;
  return parsedEnv;
}

export const env = validateEnv();
