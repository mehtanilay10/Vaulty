/**
 * Email sending via Resend.
 * Used for password reset and other transactional emails.
 */

import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmailAddress(email: string): boolean {
  if (!email || typeof email !== "string" || email.length > 320) return false;
  return EMAIL_PATTERN.test(email.trim());
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!to || !isValidEmailAddress(to)) {
    throw new Error(`Invalid recipient email address: "${to}".`);
  }

  if (!subject || typeof subject !== "string" || !subject.trim()) {
    throw new Error("Email subject is required.");
  }

  const resend = getResendClient();
  const from = process.env.EMAIL_FROM || "noreply@vaulty.app";

  const { data, error } = await resend.emails.send({
    from,
    to: to.trim(),
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || "Failed to send email");
  }

  return data;
}
