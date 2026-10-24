import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./db";
import { getEnv } from "./env";
import { clientIpFrom } from "./get-ip";
import { logger } from "./logger";
import { ratelimit } from "./rate-limit";

export function buildAuthOptions(): NextAuthOptions {
  const env = getEnv();
  const providers: NextAuthOptions["providers"] = [];

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push(GoogleProvider({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }));
  }

  // Passwordless demo sign-in: anyone can become any email. Fine for a demo,
  // never for real data, so it is off unless asked for (or nothing else exists).
  if (env.ALLOW_DEMO_LOGIN === "true" || providers.length === 0) {
    providers.push(
      CredentialsProvider({
        id: "demo",
        name: "Demo sign-in",
        credentials: { email: { label: "Email", type: "email" }, name: { label: "Name", type: "text" } },
        async authorize(credentials, req) {
          const ip = clientIpFrom((name) => {
            const value = req.headers?.[name];
            return Array.isArray(value) ? value[0] : value;
          });
          if (!(await ratelimit.signIn.limit(ip)).success) return null;

          const email = String(credentials?.email ?? "").toLowerCase().trim();
          if (!email.includes("@")) return null;
          const name = String(credentials?.name ?? "").trim() || email.split("@")[0]!;
          const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name } });
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        },
      })
    );
  }

  return {
    providers,
    secret: env.NEXTAUTH_SECRET,
    // JWT sessions, no NextAuth adapter: so the User row is created by us (above
    // for demo sign-in, below for OAuth). Without the upsert, a first-time Google
    // user would be signed in but have no row, and every route would 404.
    session: { strategy: "jwt" },
    callbacks: {
      async jwt({ token, user, account, profile }) {
        if (user) token.sub = user.id;
        if (account?.provider === "google") {
          const email = ((profile?.email ?? user?.email) as string | undefined)?.toLowerCase().trim();
          if (email) {
            token.email = email;
            try {
              const dbUser = await prisma.user.upsert({
                where: { email },
                update: { name: user?.name ?? undefined, image: user?.image ?? undefined },
                create: { email, name: user?.name ?? email.split("@")[0]!, image: user?.image ?? null },
              });
              token.sub = dbUser.id;
            } catch (error) {
              logger.error("Failed to upsert OAuth user", { email }, error);
            }
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.sub) (session.user as { id?: string }).id = token.sub;
        return session;
      },
    },
    pages: { signIn: "/", error: "/" },
    events: {
      async signIn({ user, account, isNewUser }) {
        logger.info("User signed in", { userId: user.id, provider: account?.provider, isNewUser });
      },
    },
  };
}
