import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { setupGoogleDriveConnection } from "@/lib/google-drive/oauth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid profile email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      if (!token.id && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
        });
        if (dbUser) {
          token.id = dbUser.id;
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
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
});

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}
