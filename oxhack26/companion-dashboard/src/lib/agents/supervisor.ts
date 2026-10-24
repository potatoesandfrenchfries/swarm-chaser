import { z } from "zod";
import { generateObject } from "../ai";
import { listTasks } from "../db";
import type { GraphState } from "./graph";

const routeSchema = z.object({
  route: z.enum(["task", "concern", "chat"]),
});

export async function supervisor(state: GraphState) {
  const tasks = listTasks()
    .map((t) => `- ${t.title}${t.done ? " (done)" : ""}`)
    .join("\n");

  const { route } = await generateObject({
    schema: routeSchema,
    system: "You route one message to the right specialist. Choose exactly one route.",
    prompt: `Routes:
- task: add, complete, remove, or ask about items on the to-do list.
- concern: the person mentions pain, a fall, feeling unwell, confusion, fear, or anything a carer should know about.
- chat: everything else (greetings, small talk, questions about people or memories, unclear input).

When a message fits both task and concern, choose concern.

Current to-do list:
${tasks || "(empty)"}

Message from the ${state.role}: "${state.input}"`,
  });
  return { route };
}
