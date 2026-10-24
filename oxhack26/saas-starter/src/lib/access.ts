import { prisma } from "./db";

export type Access =
  | { allowed: true; role: "owner" | "buyer" }
  | { allowed: false; reason: "unauthenticated" | "unpaid" };

/**
 * May this user read a project's gated notes?
 * The owner always can. Anyone else needs a paid unlock.
 * Keep every gated read behind this one function so the rule lives in one place.
 */
export async function checkAccess(
  project: { id: string; ownerId: string },
  userId: string | null | undefined
): Promise<Access> {
  if (!userId) return { allowed: false, reason: "unauthenticated" };
  if (project.ownerId === userId) return { allowed: true, role: "owner" };

  const paid = await prisma.unlock.findFirst({
    where: { projectId: project.id, userId, status: "paid" },
    select: { id: true },
  });
  return paid ? { allowed: true, role: "buyer" } : { allowed: false, reason: "unpaid" };
}
