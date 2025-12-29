import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // OAuth Providers
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    // Credentials Provider
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorToken: { label: "2FA Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { organization: true },
        });

        if (!user) {
          return null;
        }

        const isValidPassword = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValidPassword) {
          return null;
        }

        // Check 2FA if enabled
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          const token = credentials.twoFactorToken as string;
          if (!token) {
            // Return partial user to indicate 2FA is required
            throw new Error("2FA_REQUIRED");
          }

          // Verify 2FA token
          const { verifyTwoFactorToken } = await import("./two-factor");
          const { decrypt } = await import("./encryption");
          const secret = decrypt(user.twoFactorSecret);
          const isValid = verifyTwoFactorToken(token, secret);

          if (!isValid) {
            throw new Error("INVALID_2FA_TOKEN");
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Handle OAuth sign-in
      if (account?.provider === "google" || account?.provider === "github") {
        if (!user.email) {
          return false;
        }

        try {
          // Check if user exists
          let dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { organization: true },
          });

          if (!dbUser) {
            // Create new organization and user for OAuth
            const slug = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
            const organization = await prisma.organization.create({
              data: {
                name: `${user.name || user.email}'s Organization`,
                slug: `${slug}-${Date.now()}`,
              },
            });

            dbUser = await prisma.user.create({
              data: {
                email: user.email,
                name: user.name || user.email.split("@")[0],
                password: "", // No password for OAuth users
                role: "ADMIN",
                organizationId: organization.id,
                googleId: account.provider === "google" ? account.providerAccountId : null,
                githubId: account.provider === "github" ? account.providerAccountId : null,
                avatarUrl: user.image || profile?.avatar_url as string || null,
              },
              include: { organization: true },
            });
          } else {
            // Update OAuth IDs if not set
            const updateData: Record<string, string | null> = {};
            if (account.provider === "google" && !dbUser.googleId) {
              updateData.googleId = account.providerAccountId;
            }
            if (account.provider === "github" && !dbUser.githubId) {
              updateData.githubId = account.providerAccountId;
            }
            if (user.image && !dbUser.avatarUrl) {
              updateData.avatarUrl = user.image;
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.user.update({
                where: { id: dbUser.id },
                data: updateData,
              });
            }
          }

          // Attach database user info to the user object
          user.id = dbUser.id;
          user.role = dbUser.role;
          user.organizationId = dbUser.organizationId;
          user.organizationName = dbUser.organization.name;

          return true;
        } catch (error) {
          console.error("[Auth] OAuth sign-in error:", error);
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.organizationName = user.organizationName;
      }

      // For OAuth, fetch additional user data
      if (account?.provider === "google" || account?.provider === "github") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
          include: { organization: true },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.organizationName = dbUser.organization.name;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = token.organizationId as string;
        session.user.organizationName = token.organizationName as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
