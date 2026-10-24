import { NextResponse } from "next/server";
import { z } from "zod";
import { addTask } from "~/lib/db";
import { errorResponse } from "~/lib/http";
import { ROLES } from "~/lib/types";

const body = z.object({ title: z.string().trim().min(1).max(200), role: z.enum(ROLES) });

export async function POST(req: Request) {
  try {
    const { title, role } = body.parse(await req.json());
    return NextResponse.json({ id: addTask(title, role) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
