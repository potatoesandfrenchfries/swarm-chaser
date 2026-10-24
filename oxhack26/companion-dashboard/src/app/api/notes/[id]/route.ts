import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveNote } from "~/lib/db";
import { errorResponse, parseId } from "~/lib/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await params).id);
    const { resolved } = z.object({ resolved: z.boolean() }).parse(await req.json());
    resolveNote(id, resolved);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
