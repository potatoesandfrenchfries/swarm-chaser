import { z } from "zod";
import { generateObject } from "../ai";
import { addNote } from "../db";
import type { GraphState } from "./graph";

const concernSchema = z.object({
  summary: z.string().describe("One factual sentence for the overseer, in the third person."),
  severity: z.enum(["info", "watch", "urgent"]),
});

const REPLIES = {
  info: "Thank you for telling me. I've made a note for your care team.",
  watch: "I'm sorry to hear that. I've let your care team know so they can check in.",
  urgent:
    "That sounds serious. I've alerted your care team right now. If you're in danger or can't breathe, call emergency services.",
} as const;

export async function concernAgent(state: GraphState) {
  const concern = await generateObject({
    schema: concernSchema,
    system:
      "You record a concern for the person overseeing someone's care. urgent: a fall, chest pain, trouble breathing, or immediate danger. watch: pain, dizziness, confusion, or distress worth a check-in. info: minor or already settled.",
    prompt: `Message: "${state.input}"`,
  });

  addNote(concern.summary, concern.severity);
  // Fixed wording: a safety message should not depend on model phrasing.
  return { reply: REPLIES[concern.severity] };
}
