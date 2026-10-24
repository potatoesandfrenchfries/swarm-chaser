import { NextResponse } from "next/server";
import { z } from "zod";
import { graph } from "~/lib/agents/graph";
import { addMessage, getState } from "~/lib/db";
import { errorResponse } from "~/lib/http";
import { ROLES } from "~/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({
  input: z.string().trim().min(1).max(1000),
  role: z.enum(ROLES),
});

export async function POST(req: Request) {
  try {
    const { input, role } = body.parse(await req.json());
    const result = await graph.invoke({ input, role });
    const reply = result.reply ?? "Sorry, I didn't catch that.";

    // Logged together after the graph succeeds, so a failed call leaves no
    // orphaned message (the chat box puts the text back for a retry).
    addMessage({ role: "user", speaker: role, text: input });
    addMessage({ role: "assistant", speaker: role, text: reply, route: result.route });

    return NextResponse.json({ reply, route: result.route, state: getState(role) });
  } catch (error) {
    return errorResponse(error);
  }
}
