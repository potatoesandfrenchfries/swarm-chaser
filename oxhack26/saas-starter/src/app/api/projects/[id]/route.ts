import type { Project } from "@prisma/client";
import { apiError, handle, json } from "~/lib/api";
import { prisma } from "~/lib/db";
import { projectInput } from "~/lib/schemas";
import { getCurrentUser } from "~/lib/session";

type Context = { params: Promise<{ id: string }> };

/** The project if the signed-in user owns it, otherwise the error response to return. */
async function ownedProject(id: string): Promise<Project | Response> {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);
  // Others get the same 404 as a missing id, so ids cannot be probed.
  const project = await prisma.project.findFirst({ where: { id, ownerId: user.id } });
  return project ?? apiError("Project not found", 404);
}

export const PATCH = (req: Request, { params }: Context) =>
  handle(async () => {
    const found = await ownedProject((await params).id);
    if (found instanceof Response) return found;
    const input = projectInput.partial().parse(await req.json());
    const project = await prisma.project.update({ where: { id: found.id }, data: input });
    return json({ project });
  });

export const DELETE = (_: Request, { params }: Context) =>
  handle(async () => {
    const found = await ownedProject((await params).id);
    if (found instanceof Response) return found;
    await prisma.project.delete({ where: { id: found.id } });
    return json({ ok: true });
  });
