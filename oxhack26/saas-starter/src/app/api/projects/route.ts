import { randomBytes } from "node:crypto";
import { apiError, handle, json } from "~/lib/api";
import { prisma } from "~/lib/db";
import { getClientIp } from "~/lib/get-ip";
import { ratelimit } from "~/lib/rate-limit";
import { projectInput } from "~/lib/schemas";
import { getCurrentUser } from "~/lib/session";

export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);
    const projects = await prisma.project.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return json({ projects });
  });

export const POST = (req: Request) =>
  handle(async () => {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);
    if (!(await ratelimit.write.limit(`${user.id}:${getClientIp(req)}`)).success) {
      return apiError("Too many requests. Try again in a minute.", 429);
    }

    const input = projectInput.parse(await req.json());
    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        name: input.name,
        summary: input.summary || null,
        notes: input.notes || null,
        // Unguessable, so the share link is the only way in.
        shareSlug: randomBytes(9).toString("base64url"),
      },
    });
    return json({ project }, 201);
  });
