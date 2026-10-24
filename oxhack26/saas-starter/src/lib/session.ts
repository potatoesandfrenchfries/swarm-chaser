import { getServerSession } from "next-auth";
import { buildAuthOptions } from "./auth";
import { prisma } from "./db";

/** The signed-in user's database row, or null. Resolved by email: see auth.ts. */
export async function getCurrentUser() {
  const session = await getServerSession(buildAuthOptions());
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email) return null;
  return prisma.user.findUnique({ where: { email } });
}
