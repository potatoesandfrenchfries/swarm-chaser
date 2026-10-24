import { NextResponse } from "next/server";
import { z } from "zod";
import { removeTask, setTaskDone } from "~/lib/db";
import { errorResponse, parseId } from "~/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    const id = parseId((await params).id);
    const { done } = z.object({ done: z.boolean() }).parse(await req.json());
    setTaskDone(id, done);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    removeTask(parseId((await params).id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
