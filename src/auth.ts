import { cache } from "react";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { setupGoogleDriveConnection } from "@/lib/google-drive/oauth";
import { getUserSessionVersion } from "@/lib/session-validation";

const isLocalhost =
  process.env.NEXTAUTH_URL?.includes("localhost") || process.env.NODE_ENV === "development";

const useSecureCookies = !isLocalhost && Boolean(process.env.NEXTAUTH_URL?.startsWith("https://"));

const baseAdapter = PrismaAdapter(prisma);
const resilientAdapter = {
  ...baseAdapter,
  async useVerificationToken(identifier_token: { identifier: string; token: string }) {
    try {
      const existing = await prisma.verificationToken.findUnique({
        where: { identifier_token },
      });
      if (!existing) return null;

      await prisma.verificationToken.delete({
        where: { identifier_token },
      });

      const result = { ...existing };
      if ("id" in result && (result as { id?: string }).id) {
        delete (result as { id?: string }).id;
      }
      return result;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        return null;
      }
      throw error;
    }
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: resilientAdapter,
  trustHost: true,
  useSecureCookies,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope:
            "openid profile email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    EmailProvider({
      server: {
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: {
          user: "resend",
          pass: process.env.RESEND_API_KEY,
        },
      },
      from: process.env.EMAIL_FROM || "noreply@vaulty.app",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify-request",
  },
  events: {
    // Provision an empty credential-vault account as soon as Auth.js creates
    // the user. The user chooses their own master password on first visit;
    // no server-generated or recoverable password is ever assigned.
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.passwordVault.upsert({
        where: { userId: user.id },
        create: { userId: user.id, isConfigured: false },
        update: {},
      });
    },
  },
  callbacks: {
    authorized() {
      // Let proxy.ts enforce route-level authorization checks
      return true;
    },
    async signIn() {
      // Authentication must not depend on whether the user has completed the
      // optional credentials-vault setup. Route guards handle onboarding.
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      } else if (!token.id && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
        }
      }

      // Validate the session version on invocation using our in-memory cache (5m TTL)
      // to avoid hitting Neon DB on every single HTTP/JWT resolution.
      if (token.id) {
        try {
          const expectedVersion = await getUserSessionVersion(token.id as string);
          // Only invalidate if the user explicitly does not exist (null) or version mismatch.
          // If undefined (transient DB error), maintain existing token session.
          if (expectedVersion === null) {
            return null;
          }
          if (expectedVersion !== undefined) {
            // Tokens minted before sessionVersion existed carry no version.
            // Treat them as version 0 so a revocation bump still invalidates them
            // instead of silently upgrading the token to the current version.
            const suppliedVersion = (token.sessionVersion as number | undefined) ?? 0;
            if (suppliedVersion !== expectedVersion) {
              return null;
            }
            token.sessionVersion = expectedVersion;
          }
        } catch (err) {
          console.warn(
            "[auth.jwt] Transient error verifying session version, preserving session:",
            err,
          );
        }
      }

      if (account?.provider === "google" && account.refresh_token && token.id) {
        const existing = await prisma.storageConnection.findFirst({
          where: { userId: token.id as string, provider: "GOOGLE_DRIVE" },
        });
        if (!existing) {
          try {
            await setupGoogleDriveConnection(token.id as string, {
              accessToken: account.access_token || "",
              refreshToken: account.refresh_token,
              expiresAt: new Date((account.expires_at || 0) * 1000),
            });
          } catch (error) {
            console.error("Failed to auto-setup Google Drive:", error);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.sessionVersion = token.sessionVersion as number;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
});

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
});
