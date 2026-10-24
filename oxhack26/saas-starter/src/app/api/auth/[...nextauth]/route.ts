import NextAuth from "next-auth";
import { buildAuthOptions } from "~/lib/auth";

// Options are built per request so env validation happens at runtime, not build time.
const handler = (req: Request, ctx: unknown) =>
  NextAuth(buildAuthOptions())(req as never, ctx as never);

export { handler as GET, handler as POST };
